/* ===========================================================
   boot.js — 启动入口
   =========================================================== */
(function () {
  'use strict';

  function fail(e) {
    console.error('[boot]', e);
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;padding:14px 16px;' +
      'border-radius:12px;background:#2a1017;border:1px solid #fb7185;color:#ffd7dd;' +
      'font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;';
    box.textContent = '启动失败：' + (e && e.message ? e.message : String(e));
    document.body.appendChild(box);
  }

  function start() {
    try {
      if (!window.GH || !window.GH.Hub) throw new Error('核心脚本未加载');
      window.GH.Hub.boot();
    } catch (e) { fail(e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
