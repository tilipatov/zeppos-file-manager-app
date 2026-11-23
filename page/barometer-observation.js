import { createWidget, deleteWidget, widget, prop, align, text_style } from '@zos/ui'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { statSync, openSync, readSync, closeSync, O_RDONLY } from '@zos/fs'
import { push } from '@zos/router'
import { getText } from '@zos/i18n'
import { px } from '@zos/utils'
import { directoryReport } from '../utils/directory-report'
import { durations, intervalMs, sampleBarometer, makeObservation, observationReport } from '../utils/barometer-observation'

const app = getApp()._options.globalData;
const folderFiles = ['baro_manager.dat', 'pressure.dat'];

function openFolder(paths) {
  const pathFor = name => paths[folderFiles.indexOf(name)];
  return {
    stat(name) { return statSync({ path: pathFor(name) }); },
    read(name, position, length) {
      const fd = openSync({ path: pathFor(name), flag: O_RDONLY });
      if (!Number.isInteger(fd) || fd < 0) throw Error('open failed');
      try {
        const buffer = new ArrayBuffer(length);
        const read = readSync({ fd, buffer, options: { position, length } });
        if (read !== length) throw Error('short read ' + read + '/' + length);
        return new DataView(buffer);
      } finally {
        closeSync(fd);
      }
    },
  };
}

Page({
  build() {
    this.paths = app.barometerObservationPaths;
    delete app.barometerObservationPaths;
    this.controls = [];
    this.label = createWidget(widget.TEXT, {
      x: px(62), y: px(70), w: px(356), h: px(151), text_size: px(22),
      align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP,
      color: 0xffffff, text: getText('observe_choose'),
    });
    const saved = app.barometerObservation;
    if (saved && saved.paths.join('\n') === this.paths?.join('\n')) {
      this.observation = saved.observation;
      this.showResult();
    } else {
      this.choose();
    }
  },
  button(y, title, action) {
    this.controls.push(createWidget(widget.BUTTON, {
      x: px(98), y: px(y), w: px(284), h: px(48), radius: px(16), text_size: px(21),
      normal_color: 0x285369, press_color: 0x407891, text: title, click_func: action,
    }));
  },
  clearButtons() {
    for (const control of this.controls) deleteWidget(control);
    this.controls = [];
  },
  choose() {
    this.clearButtons();
    this.label.setProperty(prop.TEXT, getText('observe_choose'));
    durations.forEach((minutes, index) => {
      this.button(220 + 53 * index, minutes + ' ' + getText('observe_minutes'), () => this.start(minutes));
    });
  },
  start(minutes) {
    if (!this.paths || this.timer !== undefined) return;
    this.clearButtons();
    this.button(280, getText('observe_stop'), () => this.stop());
    const start = Date.now();
    this.observation = makeObservation(minutes, start);
    const fs = openFolder(this.paths);
    this.keepAwake = setPageBrightTime({ brightTime: minutes * 60000 + 15000 }) === 0;
    const tick = () => {
      const done = this.observation.tick(Date.now(), () => sampleBarometer(fs));
      if (done) this.stop();
      else {
        const count = this.observation.rows.filter(row => !row.gap).length;
        this.label.setProperty(prop.TEXT, getText('observe_running') + '\n' + count + ' / ' +
          (this.observation.slots + 1) + (this.keepAwake ? '' : '\n' + getText('observe_keep_awake')));
      }
    };
    this.timer = setInterval(tick, intervalMs);
    tick();
  },
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    resetPageBrightTime();
    app.barometerObservation = { paths: this.paths, observation: this.observation };
    this.showResult();
  },
  showResult() {
    this.clearButtons();
    const report = observationReport(this.observation);
    const count = this.observation.rows.filter(row => !row.gap).length;
    this.label.setProperty(prop.TEXT, getText('observe_result') + '\n' + count + ' / ' +
      (this.observation.slots + 1) + '\n' + getText('observe_updates') + ' ' + Math.max(0, report.changes.length - 1));
    const show = lines => {
      app.directoryReportPages = directoryReport(report.header, lines.map(name => ({ name, type: 'text' })));
      push({ url: 'page/directory-report' });
    };
    this.button(220, getText('observe_changes_qr'), () => show(report.changes));
    this.button(273, getText('observe_full_qr'), () => show(report.rows));
    this.button(326, getText('observe_again'), () => this.choose());
  },
  onDestroy() {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    resetPageBrightTime();
    app.barometerObservation = { paths: this.paths, observation: this.observation };
  },
})
