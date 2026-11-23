export const intervalMs = 30000;
export const durations = [5, 10, 20];

function floatValues(view) {
  const values = [];
  for (let offset = 0; offset < view.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    values.push(Number.isFinite(value) ? value : null);
  }
  return values;
}

export function sampleBarometer(fs) {
  const sample = {};
  try {
    const head = fs.read('baro_manager.dat', 0, 16);
    if (head.getUint32(0, true) !== 0xAA55AA55) throw Error('unknown header');
    sample.manager = {
      number: head.getUint32(4, true),
      seconds: head.getUint32(8, true),
      pressure: floatValues(new DataView(head.buffer, head.byteOffset + 12, 4))[0],
    };
  } catch (error) {
    sample.managerError = String(error).slice(0, 75);
  }

  try {
    const info = fs.stat('pressure.dat');
    if (!info || !Number.isInteger(info.size) || info.size < 4 || info.size % 4) throw Error('invalid size');
    const count = info.size / 4;
    const tailLength = Math.min(16, info.size);
    const tail = floatValues(fs.read('pressure.dat', info.size - tailLength, tailLength));
    sample.history = { count, tail };
    if (Number.isFinite(info.mtimeMs) && info.mtimeMs > 0) sample.history.mtimeMs = info.mtimeMs;
    const number = sample.manager && sample.manager.number;
    if (number >= 1 && number <= count) {
      const start = Math.max(1, number - 1);
      const entries = Math.min(count, number + 1) - start + 1;
      sample.history.near = {
        start,
        values: floatValues(fs.read('pressure.dat', (start - 1) * 4, entries * 4)),
      };
    }
    const after = fs.stat('pressure.dat');
    if (!after || after.size !== info.size ||
      (sample.history.mtimeMs !== undefined && sample.history.mtimeMs !== after.mtimeMs)) {
      delete sample.history;
      throw Error('history changed during read');
    }
  } catch (error) {
    delete sample.history;
    sample.historyError = String(error).slice(0, 75);
  }
  return sample;
}

export function makeObservation(minutes, start) {
  const slots = minutes * 60000 / intervalMs;
  let next = 0;
  const rows = [];
  return {
    slots,
    rows,
    tick(at, read) {
      const slot = Math.min(slots, Math.floor((at - start) / intervalMs));
      if (slot === next) {
        rows.push({ slot, at, ...read() });
        next++;
      } else if (slot > next) {
        rows.push({ gap: slot - next });
        rows.push({ slot, at, ...read() });
        next = slot + 1;
      }
      return next > slots;
    },
  };
}

function time(value) {
  const date = new Date(value);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => ('0' + n).slice(-2)).join(':');
}

function compact(row) {
  if (row.gap) return '# missed ' + row.gap;
  const m = row.manager;
  const h = row.history;
  return [
    time(row.at),
    m ? [m.number, time(m.seconds * 1000), m.pressure].join('/') : 'M? ' + (row.managerError || ''),
    h ? h.count + '/' + h.tail.join(',') : 'P? ' + (row.historyError || ''),
    h && h.near ? h.near.start + ':' + h.near.values.join(',') : '-',
    h && h.mtimeMs ? time(h.mtimeMs) : '-',
  ].join(' | ');
}

export function observationReport(observation) {
  const rows = observation.rows.filter(row => !row.gap);
  let last;
  const changes = rows.filter(row => {
    if (!row.manager) return false;
    const a = row.manager;
    const changed = !last || a.number !== last.number || a.seconds !== last.seconds || a.pressure !== last.pressure;
    last = a;
    return changed;
  });
  const first = rows[0];
  const end = rows[rows.length - 1];
  const header = ['Barometer / ' + new Date(first.at).toISOString().slice(0, 10),
    '30s / ' + rows.length + '/' + (observation.slots + 1) + ' / ' + time(first.at) + '-' + time(end.at),
    'seen | index/time/Pa | count/tail Pa | neighbors | mtime'].join('\n');
  return {
    header,
    changes: changes.map(compact),
    rows: observation.rows.map(compact),
  };
}
