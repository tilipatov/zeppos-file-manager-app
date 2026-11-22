import { getText } from '@zos/i18n'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { px } from '@zos/utils';
import { setWakeUpRelaunch } from '@zos/display'
import { createWidget, deleteWidget, widget, align, text_style, event, prop, getTextLayout } from '@zos/ui'
import { push, back } from '@zos/router'
import { getScrollTop, setScrollMode, SCROLL_MODE_FREE, scrollTo } from '@zos/page'
import { KEY_HOME, onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { showLoading, showData, showPath, getLeftX, showEmptiness, showExit } from '../utils'

import { directoryReport, isPressureEntry } from '../utils/directory-report'
const globalData = getApp()._options.globalData;

const crownIdleMs = 800;
const crownPollMs = 32;

Page({
  onInit() {
    this.back = true;
    setWakeUpRelaunch({relaunch: true}); // Чтобы страница не закрывалась когда потухнет экран
  },

  build() {

    this.elems = [];
    onDigitalCrown({ callback: key => {
      if (key === KEY_HOME && this.elems.length) this.trackCrownScroll();
      return false;
    } });

    //createWidget(widget.PAGE_SCROLLBAR); // Полоса прокрутки блокируют вызов обработчика события scroll_frame_func!

    setScrollMode({
      mode: SCROLL_MODE_FREE,
      options: {
        modeParams: {
          scroll_frame_func: (param) => this.onScroll(param.yoffset),
        }
      },
    });

    this.yoffset = showExit();
    this.ypos = this.yoffset;

    const path = globalData.explorer.prefix.name + ': /' + globalData.explorer.getPath();
    showPath(path, this.ypos);

    this.loadingWidget = showLoading(this.ypos);

    this.loadingTimer = setTimeout(() => this.showFiles(), 300);
    
  },

  showFiles(){
    deleteWidget(this.loadingWidget);

    let dir = globalData.explorer.dir();

    // Статистика по папке
    let data = '';
    if (dir.folders > 0) data += getText('folders') + dir.folders
    if (dir.files > 0) data += (data !== '' ? '\n' : '') + getText('files') + dir.files + ' (' + globalData.explorer.getSizeStr(dir.filesSize) + ')';
    if (data === '') data = getText('empty');
    showData(data, this.ypos);


    const entries = dir.dir;
    const matches = entries.filter(isPressureEntry);
    dir = matches.length ? matches.concat(entries.filter(entry => !isPressureEntry(entry))) : entries;
    this.ypos += px(160);
    createWidget(widget.BUTTON, {
      x: px(70), y: this.ypos, w: px(340), h: px(44), radius: px(14),
      normal_color: 0x285369, press_color: 0x407891, text_size: px(20),
      text: getText('directory_qr') + ' · ' + getText('pressure_matches') + ' ' + matches.length,
      click_func: () => {
        const path = globalData.explorer.prefix.name + ': /' + globalData.explorer.getPath();
        globalData.directoryReportPages = directoryReport(path, entries);
        this.back = false;
        push({url: 'page/directory-report'});
      }
    });

    let yoffset = globalData.yoffsets[globalData.yoffsets.length - 1];
    if (yoffset > -this.yoffset){
      yoffset = -this.yoffset;
      globalData.yoffsets[globalData.yoffsets.length - 1] = yoffset;
    }
    this.ypos += px(52);

    for (const file of dir){
      
      let x = getLeftX(this.ypos + yoffset);
      const imgWidget = createWidget(widget.IMG, {
        x: x,
        y: this.ypos,
        w: px(56),
        h: px(64),
        src: file.icon
      });
      imgWidget.addEventListener(event.CLICK_UP, () => this.onClick(file));
      this.elems.push({x: 0, y: this.ypos, w: px(56), widget: imgWidget});
      
      const text = file.name !== '..' ? file.name : getText('up');
      const { width } = getTextLayout(text, {
        text_size: px(24),
        text_width: px(480),
        wrapped: 0
      })

      x += px(56);
      const w = Math.min(px(480 - 56), width + px(8));

      const nameWidget = createWidget(widget.BUTTON, {
        x: x,
        y: this.ypos,
        w: w,
        h: px(64),
        color: isPressureEntry(file) ? 0x68ecae : 0xffffff,
        text_size: px(24),
        normal_color: 0x000000,
        press_color: 0x404040,
        radius: px(8),
        text: text,
        click_func: () => this.onClick(file),
        longpress_func: () => this.onLongpress(file)
      });
      this.elems.push({x: px(56), y: this.ypos, w: w, widget: nameWidget});
      
      this.ypos += px(64);
    }

    showEmptiness(this.ypos, this.yoffset);

    this.onScroll(yoffset);
    scrollTo({y: yoffset});

  },

  trackCrownScroll() {
    this.lastCrownRotation = Date.now();
    if (this.crownTimer !== undefined) return;

    // Native crown scrolling can move the page without a scroll-frame callback.
    this.crownTimer = setInterval(() => {
      const top = getScrollTop();
      if (Number.isFinite(top)) this.onScroll(-Math.abs(top));
      if (Date.now() - this.lastCrownRotation >= crownIdleMs) this.stopCrownScroll();
    }, crownPollMs);
  },

  stopCrownScroll() {
    if (this.crownTimer === undefined) return;
    clearInterval(this.crownTimer);
    this.crownTimer = undefined;
  },

  onScroll(yoffset) {
    if (!Number.isFinite(yoffset) || yoffset === this.lastLayoutOffset) return;
    this.lastLayoutOffset = yoffset;
    globalData.yoffsets[globalData.yoffsets.length - 1] = yoffset;
    for (let i = 0; i < this.elems.length; i += 2) {
      const y = this.elems[i].y + yoffset;
      if (y < -px(32)) continue;
      if (y > px(448)) break;
      const x = getLeftX(y);
      for (let j = i; j <= i + 1; j++) {
        const elem = this.elems[j];
        elem.widget.setProperty(prop.MORE, {
          x: x + elem.x,
          y: elem.y,
          w: elem.w,
          h: px(64)
        });
      }
    }
  },

  onClick(file){
    this.logFileName(file);
    if (file.type === 'folder'){
      globalData.explorer.go(file.name);
      this.back = false;
      globalData.yoffsets.push(0);
      push({url: 'page/files-list'});
    } else if (file.type === 'back'){
      back();
    } else {
      this.back = false;
      push({
        url: 'page/show-file',
        params: file
      });
    }
  },

  onLongpress(file){
    this.logFileName(file);
    if (file.type !== 'back'){
      this.back = false;
      push({
        url: 'page/file-info',
        params: file
      });
    }
  },

  logFileName(file){
    let fileName = globalData.explorer.getFullPath();
    if (fileName.slice(-1) != '/') fileName += '/';
    fileName += file.name;
    console.log(fileName);
  },

  onDestroy() {
    clearTimeout(this.loadingTimer);
    this.stopCrownScroll();
    offDigitalCrown();
    if (this.back){
      globalData.yoffsets.pop();
      globalData.explorer.back();
    }
  }

})
