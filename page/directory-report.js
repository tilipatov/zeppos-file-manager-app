import { createWidget, deleteWidget, widget, prop, align } from '@zos/ui'
import { getText } from '@zos/i18n'
import { px } from '@zos/utils'
import { back } from '@zos/router'

Page({
  build() {
    const data = getApp()._options.globalData;
    this.pages = data.directoryReportPages || [];
    delete data.directoryReportPages;
    if (!this.pages.length) { back(); return; }

    this.index = 0;
    this.counter = createWidget(widget.TEXT, {
      x: px(120), y: px(50), w: px(240), h: px(38), text_size: px(24),
      color: 0xffffff, align_h: align.CENTER_H, text: '',
    });
    this.drawCode();
    const button = (x, w, text, click_func) => createWidget(widget.BUTTON, {
      x: px(x), y: px(374), w: px(w), h: px(46), radius: px(14), text_size: px(22),
      normal_color: 0x285369, press_color: 0x407891, text, click_func,
    });
    button(181, 118, getText('back'), () => back());
    if (this.pages.length > 1) {
      button(115, 54, '‹', () => this.turn(-1));
      button(311, 54, '›', () => this.turn(1));
    }
  },
  turn(step) {
    const n = this.index + step;
    if (n < 0 || n >= this.pages.length) return;
    this.index = n;
    this.drawCode();
  },
  drawCode() {
    if (this.code) deleteWidget(this.code);
    const counter = (this.index + 1) + '/' + this.pages.length;
    this.counter.setProperty(prop.TEXT, counter);
    this.code = createWidget(widget.QRCODE, {
      x: px(120), y: px(112), w: px(240), h: px(240),
      bg_x: px(98), bg_y: px(90), bg_w: px(284), bg_h: px(284),
      content: 'File Manager ' + counter + '\n' + this.pages[this.index],
    });
  },
})
