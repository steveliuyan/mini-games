/* ===========================================================
   ui.js — Toast / 遮罩弹层 / 结算面板 / 成就解锁动画
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var toastLayer = null;
  var overlayLayer = null;
  var modalHost = null;
  var activeModal = null;

  function ensure() {
    if (!toastLayer) toastLayer = document.getElementById('toastLayer');
    if (!overlayLayer) overlayLayer = document.getElementById('overlayLayer');
    if (!modalHost) modalHost = overlayLayer;
  }

  /* ------------------------ Toast ------------------------ */
  var MAX_TOAST = 3;
  function toast(msg, opts) {
    ensure();
    opts = opts || {};
    if (!toastLayer) return;
    while (toastLayer.children.length >= MAX_TOAST) {
      toastLayer.removeChild(toastLayer.firstChild);
    }
    var node = U.el('div', 'toast' + (opts.type ? ' is-' + opts.type : ''));
    node.innerHTML = (opts.icon ? '<span class="t-ico">' + opts.icon + '</span>' : '') +
      '<span>' + msg + '</span>';
    toastLayer.appendChild(node);
    window.setTimeout(function () {
      node.classList.add('out');
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 300);
    }, opts.duration || 2200);
  }

  /* ------------------------ 弹层控制 ------------------------ */
  function openModal(node, opts) {
    ensure();
    opts = opts || {};
    closeModal(true);
    activeModal = { node: node, onClose: opts.onClose, escape: opts.escape !== false };
    U.clear(overlayLayer);
    overlayLayer.appendChild(node);
    overlayLayer.classList.add('is-open');
  }

  function closeModal(silent) {
    ensure();
    if (!activeModal) return;
    var m = activeModal;
    activeModal = null;
    if (overlayLayer) {
      overlayLayer.classList.remove('is-open');
      U.clear(overlayLayer);
    }
    if (!silent && m.onClose) m.onClose();
  }

  function isModalOpen() { return !!activeModal; }

  /* 点击遮罩空白处关闭（仅在允许时） */
  document.addEventListener('click', function (e) {
    if (!activeModal || !activeModal.dismissible) return;
    if (e.target === overlayLayer) closeModal();
  });

  /* ------------------------ 结算面板 ------------------------ */
  /* opts: { win, title, sub, score, best, isNew, icon, retryText, onRetry, onHome, extra } */
  function result(opts) {
    opts = opts || {};
    var win = !!opts.win;
    var node = U.el('div', 'modal');

    var html = '';
    if (opts.isNew && opts.score > 0) html += '<div class="ribbon">新 纪 录</div>';
    html += '<div class="modal-ico">' + (opts.icon || (win ? '🏆' : '💥')) + '</div>';
    html += '<h3 class="modal-title">' + (opts.title || (win ? '通关！' : '游戏结束')) + '</h3>';
    if (opts.sub) html += '<p class="modal-sub">' + opts.sub + '</p>';
    if (opts.score != null) {
      html += '<div class="modal-score">' +
        '<div><label>本局得分</label><b>' + U.fmtNum(opts.score) + '</b></div>' +
        '<div class="hi"><label>历史最高</label><b>' + U.fmtNum(opts.best) + '</b></div>' +
        '</div>';
    }
    if (opts.extra) html += opts.extra;
    node.innerHTML = html;

    var actions = U.el('div', 'modal-actions');
    var homeBtn = U.el('button', 'btn ghost', '返回大厅');
    homeBtn.addEventListener('click', function () {
      closeModal(true);
      if (opts.onHome) opts.onHome();
    });
    var retryBtn = U.el('button', 'btn primary', opts.retryText || '再来一局');
    retryBtn.addEventListener('click', function () {
      closeModal(true);
      if (opts.onRetry) opts.onRetry();
    });
    actions.appendChild(homeBtn);
    actions.appendChild(retryBtn);
    node.appendChild(actions);

    openModal(node);
    window.setTimeout(function () { retryBtn.focus(); }, 30);
    return node;
  }

  /* ------------------------ 暂停面板 ------------------------ */
  function pausePanel(opts) {
    opts = opts || {};
    var node = U.el('div', 'modal');
    node.innerHTML =
      '<div class="modal-ico">⏸️</div>' +
      '<h3 class="modal-title">已暂停</h3>' +
      '<p class="modal-sub">' + (opts.sub || '按 P 或点击继续按钮恢复游戏') + '</p>';
    var actions = U.el('div', 'modal-actions');
    var homeBtn = U.el('button', 'btn ghost', '返回大厅');
    homeBtn.addEventListener('click', function () { closeModal(true); if (opts.onHome) opts.onHome(); });
    var resumeBtn = U.el('button', 'btn primary', '继续游戏');
    resumeBtn.addEventListener('click', function () { closeModal(true); if (opts.onResume) opts.onResume(); });
    actions.appendChild(homeBtn);
    actions.appendChild(resumeBtn);
    node.appendChild(actions);
    openModal(node, { onClose: function () { if (opts.onResume) opts.onResume(); } });
    return node;
  }

  /* ------------------------ 确认面板 ------------------------ */
  function confirm(opts) {
    opts = opts || {};
    var node = U.el('div', 'modal');
    node.innerHTML =
      '<div class="modal-ico">' + (opts.icon || '❓') + '</div>' +
      '<h3 class="modal-title">' + (opts.title || '确认操作') + '</h3>' +
      '<p class="modal-sub">' + (opts.sub || '') + '</p>';
    var actions = U.el('div', 'modal-actions');
    var no = U.el('button', 'btn ghost', opts.cancelText || '取消');
    no.addEventListener('click', function () { closeModal(true); if (opts.onCancel) opts.onCancel(); });
    var yes = U.el('button', 'btn ' + (opts.danger ? 'danger' : 'primary'), opts.okText || '确定');
    yes.addEventListener('click', function () { closeModal(true); if (opts.onOk) opts.onOk(); });
    actions.appendChild(no);
    actions.appendChild(yes);
    node.appendChild(actions);
    openModal(node);
    return node;
  }

  /* ------------------------ 成就解锁 ------------------------ */
  function achievement(a) {
    GH.Audio.play('unlock');
    var node = U.el('div', 'modal ach');
    node.innerHTML =
      '<div class="ribbon">成 就 解 锁</div>' +
      '<div class="modal-ico">' + a.icon + '</div>' +
      '<h3 class="modal-title">' + a.name + '</h3>' +
      '<p class="modal-sub">' + a.desc + '</p>';
    var actions = U.el('div', 'modal-actions');
    var ok = U.el('button', 'btn primary', '收下');
    ok.addEventListener('click', function () { closeModal(true); });
    actions.appendChild(ok);
    node.appendChild(actions);
    openModal(node);
    window.setTimeout(function () { ok.focus(); }, 30);
  }

  /* ------------------------ 游戏内说明面板 ------------------------ */
  function info(opts) {
    opts = opts || {};
    var node = U.el('div', 'modal');
    node.innerHTML =
      '<div class="modal-ico">' + (opts.icon || 'ℹ️') + '</div>' +
      '<h3 class="modal-title">' + (opts.title || '说明') + '</h3>' +
      '<div class="modal-sub" style="text-align:left">' + (opts.html || '') + '</div>';
    var actions = U.el('div', 'modal-actions');
    var ok = U.el('button', 'btn primary', '知道了');
    ok.addEventListener('click', function () { closeModal(true); });
    actions.appendChild(ok);
    node.appendChild(actions);
    openModal(node);
    return node;
  }

  GH.UI = {
    toast: toast,
    result: result,
    pausePanel: pausePanel,
    confirm: confirm,
    achievement: achievement,
    info: info,
    openModal: openModal,
    closeModal: closeModal,
    isModalOpen: isModalOpen,
    get activeModal() { return activeModal; }
  };
})(window.GH);
