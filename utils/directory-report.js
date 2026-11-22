// The input is the list of rows that the explorer has already prepared for display.
export function isPressureEntry(entry) {
  const name = entry.name.toLowerCase();
  if (entry.type === 'folder') return name === 'baro_altim';
  return entry.type !== 'back' && name === 'pressure.dat';
}

export function directoryReport(path, entries) {
  const pages = [];
  let page = '';
  let bytes = 0;
  function flush() {
    if (page) pages.push(page);
    page = '';
    bytes = 0;
  }
  function append(line) {
    // QR codes on a 480px screen stay readable with short UTF-8 payloads.
    const lineSize = Array.from(line).reduce((sum, ch) => sum + utf8Size(ch), 0);
    if (bytes && bytes + lineSize > 240) flush();
    for (const ch of line) {
      const size = utf8Size(ch);
      if (bytes + size > 240) flush();
      page += ch;
      bytes += size;
    }
  }
  append(path + '\n');
  for (const entry of entries) {
    if (entry.type !== 'back') append(entry.name + (entry.type === 'folder' ? '/' : '') + '\n');
  }
  flush();
  return pages;
}

function utf8Size(ch) {
  const code = ch.codePointAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
}
