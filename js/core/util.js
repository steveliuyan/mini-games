/* ===========================================================
   util.js — 事件总线、DOM 助手、数学与格式化工具、定时器托管
   =========================================================== */
window.GH = window.GH || {};
(function (GH) {
  'use strict';

  /* ------------------------ 事件总线 ------------------------ */
  var listeners = {};
  GH.bus = {
    on: function (type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
      return function () { GH.bus.off(type, fn); };
    },
    off: function (type, fn) {
      var arr = listeners[type];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i > -1) arr.splice(i, 1);
    },
    emit: function (type) {
      var arr = listeners[type];
      if (!arr || !arr.length) return;
      var args = Array.prototype.slice.call(arguments, 1);
      arr.slice().forEach(function (fn) {
        try { fn.apply(null, args); } catch (e) { console.error('[bus] ' + type, e); }
      });
    }
  };

  /* ------------------------ DOM 助手 ------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    return function () { target.removeEventListener(type, fn, opts); };
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ------------------------ 数学 ------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function randFloat(lo, hi) { return lo + Math.random() * (hi - lo); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function chance(p) { return Math.random() < p; }

  /* ------------------------ 格式化 ------------------------ */
  function fmtNum(n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) return h + ' 时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + s + ' 秒';
    return s + ' 秒';
  }

  function fmtClock(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtDate(ts) {
    var d = new Date(ts || Date.now());
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------ 颜色 ------------------------ */
  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 91, g: 140, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (a == null ? 1 : a) + ')';
  }
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    function f(v) { return clamp(Math.round(v + 255 * amt), 0, 255); }
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }

  /* ------------------------ 定时器托管 ------------------------ */
  /* 所有由 api 创建的定时器/动画帧都会在游戏销毁时自动清理，
     避免切游戏后残留循环。 */
  function TimerBag() {
    this._t = [];
    this._i = [];
    this._r = [];
    this._disposed = false;
  }
  TimerBag.prototype.timeout = function (fn, ms) {
    if (this._disposed) return 0;
    var self = this;
    var id = window.setTimeout(function () {
      var i = self._t.indexOf(id);
      if (i > -1) self._t.splice(i, 1);
      fn();
    }, ms);
    this._t.push(id);
    return id;
  };
  TimerBag.prototype.interval = function (fn, ms) {
    if (this._disposed) return 0;
    var id = window.setInterval(fn, ms);
    this._i.push(id);
    return id;
  };
  TimerBag.prototype.raf = function (fn) {
    if (this._disposed) return 0;
    var self = this;
    var id = window.requestAnimationFrame(function (t) {
      var i = self._r.indexOf(id);
      if (i > -1) self._r.splice(i, 1);
      fn(t);
    });
    this._r.push(id);
    return id;
  };
  /* 自驱循环：回调返回 false 时停止 */
  TimerBag.prototype.loop = function (fn) {
    var self = this;
    function step(t) {
      if (self._disposed) return;
      if (fn(t) === false) return;
      self.raf(step);
    }
    self.raf(step);
  };
  TimerBag.prototype.clearTimeout = function (id) {
    window.clearTimeout(id);
    var i = this._t.indexOf(id);
    if (i > -1) this._t.splice(i, 1);
  };
  TimerBag.prototype.clearInterval = function (id) {
    window.clearInterval(id);
    var i = this._i.indexOf(id);
    if (i > -1) this._i.splice(i, 1);
  };
  TimerBag.prototype.dispose = function () {
    this._disposed = true;
    this._t.forEach(window.clearTimeout);
    this._i.forEach(window.clearInterval);
    this._r.forEach(window.cancelAnimationFrame);
    this._t = []; this._i = []; this._r = [];
  };

  /* 独立 rAF 循环（无 api 时可用），返回 stop */
  GH.rafLoop = function (step) {
    var stopped = false;
    var last = 0;
    function frame(t) {
      if (stopped) return;
      var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;
      if (step(dt, t) === false) { stopped = true; return; }
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
    return function () { stopped = true; };
  };

  /* ------------------------ 几何 ------------------------ */
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function circleRect(cx, cy, r, rc) {
    var nx = clamp(cx, rc.x, rc.x + rc.w);
    var ny = clamp(cy, rc.y, rc.y + rc.h);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }
  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* 圆角矩形路径（兼容无 ctx.roundRect 的环境） */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r == null ? 6 : r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 带描边的文本 */
  function label(ctx, text, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = o.font || 'bold 20px ' + DEFAULT_FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineWidth = o.lineWidth || 4;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = o.fill || '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  var DEFAULT_FONT = '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  GH.util = {
    $: $, $$: $$, el: el, on: on, clear: clear,
    clamp: clamp, lerp: lerp, randInt: randInt, randFloat: randFloat,
    choice: choice, shuffle: shuffle, chance: chance,
    fmtNum: fmtNum, fmtDuration: fmtDuration, fmtClock: fmtClock, fmtDate: fmtDate,
    hexToRgb: hexToRgb, rgba: rgba, shade: shade,
    TimerBag: TimerBag,
    rectsOverlap: rectsOverlap, circleRect: circleRect, dist: dist,
    rr: rr, label: label, FONT: DEFAULT_FONT
  };
})(window.GH);
