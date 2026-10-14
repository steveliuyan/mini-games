/* ===========================================================
   hub.js — 游戏注册表、路由、大厅渲染、游戏宿主与运行时 API
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;
  var el = U.el;

  /* ------------------------ 分类 ------------------------ */
  var CATEGORIES = [
    { id: 'all',     name: '全部',     icon: '🎲' },
    { id: 'classic', name: '经典休闲', icon: '🎮' },
    { id: 'puzzle',  name: '益智脑力', icon: '🧩' },
    { id: 'versus',  name: '对局竞技', icon: '⚔️' },
    { id: 'arcade',  name: '街机反应', icon: '🕹️' }
  ];

  /* ------------------------ 按键规范化 ------------------------ */
  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Up: 'up', Down: 'down', Left: 'left', Right: 'right',
    w: 'up', W: 'up', a: 'left', A: 'left', s: 'down', S: 'down', d: 'right', D: 'right',
    Enter: 'enter', ' ': 'space', Spacebar: 'space',
    Escape: 'escape', Esc: 'escape',
    Backspace: 'backspace', Delete: 'delete',
    Tab: 'tab', Shift: 'shift', Control: 'control', Alt: 'alt',
    '+': 'plus', '=': 'plus', '-': 'minus', _: 'minus',
    ',': 'comma', '.': 'period', '/': 'slash'
  };
  function normKey(e) {
    var raw = e.key;
    if (KEYMAP[raw]) return KEYMAP[raw];
    if (raw && raw.length === 1) {
      var lower = raw.toLowerCase();
      if (lower >= '0' && lower <= '9') return lower;
      if (lower >= 'a' && lower <= 'z') return lower;
    }
    if (e.code && e.code.indexOf('Digit') === 0) return e.code.slice(5);
    if (e.code && e.code.indexOf('Numpad') === 0) return e.code.slice(6).toLowerCase();
    return raw ? raw.toLowerCase() : 'unknown';
  }

  /* 需要阻止默认行为的按键（避免页面滚动 / 空格触发按钮） */
  var PREVENT = { up: 1, down: 1, left: 1, right: 1, space: 1 };

  /* ------------------------ 注册表 ------------------------ */
  var games = [];
  var byId = {};
  var current = null;

  function register(def) {
    if (!def || !def.id) throw new Error('游戏定义缺少 id');
    if (byId[def.id]) { console.warn('[hub] 重复注册：' + def.id); return; }
    def.categories = def.categories || [def.category || 'classic'];
    def.keys = def.keys !== false;
    games.push(def);
    byId[def.id] = def;
    return def;
  }

  /* ------------------------ 大厅 ------------------------ */
  var hallEl, gridEl, tabsEl, statsEl, achListEl, achProgEl, emptyEl, searchInput;
  var activeCat = 'all';
  var keyword = '';

  function catName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].name;
    return id;
  }

  function renderStats() {
    var d = GH.Store.all();
    var played = Object.keys(d.plays).length;
    var cards = [
      { label: '收录游戏', value: games.length },
      { label: '已玩过',   value: played },
      { label: '总对局',   value: d.stats.plays },
      { label: '成就',     value: GH.Achievements.unlockedCount() + '/' + GH.Achievements.total() }
    ];
    U.clear(statsEl);
    cards.forEach(function (c) {
      var n = el('div', 'stat-card');
      n.innerHTML = '<label>' + c.label + '</label><b>' + U.fmtNum(c.value) + '</b>';
      statsEl.appendChild(n);
    });
  }

  function renderTabs() {
    U.clear(tabsEl);
    CATEGORIES.forEach(function (c) {
      var count = c.id === 'all' ? games.length : games.filter(function (g) {
        return g.categories.indexOf(c.id) > -1;
      }).length;
      var btn = el('button', 'tab' + (c.id === activeCat ? ' is-active' : ''),
        c.icon + ' ' + c.name + '<span class="cnt">' + count + '</span>');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', function () {
        activeCat = c.id;
        GH.Audio.play('click');
        renderTabs();
        renderGrid();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderGrid() {
    var list = games.filter(function (g) {
      if (activeCat !== 'all' && g.categories.indexOf(activeCat) === -1) return false;
      if (keyword) {
        var hay = (g.name + ' ' + (g.desc || '') + ' ' + (g.tags || []).join(' ') + ' ' +
          g.categories.map(catName).join(' ')).toLowerCase();
        if (hay.indexOf(keyword) === -1) return false;
      }
      return true;
    });

    U.clear(gridEl);
    emptyEl.hidden = list.length > 0;

    list.forEach(function (g, i) {
      var best = GH.Store.getBest(g.id);
      var plays = GH.Store.getPlays(g.id);
      var card = el('button', 'card');
      card.type = 'button';
      card.style.setProperty('--card-color', g.color || '#5b8cff');
      card.style.animationDelay = Math.min(i * 26, 420) + 'ms';

      var bestHtml = best > 0
        ? '<div class="card-best"><label>最高</label><b>' + U.fmtNum(best) + '</b></div>'
        : '<div class="card-best none"><b>未挑战</b></div>';

      card.innerHTML =
        '<div class="card-top">' +
          '<div class="card-ico">' + g.icon + '</div>' +
          '<div class="card-head">' +
            '<div class="card-name">' + g.name +
              (plays === 0 ? '<span class="badge-new">NEW</span>' : '') +
            '</div>' +
            '<div class="card-desc">' + (g.desc || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-foot">' +
          bestHtml +
          '<span class="card-play">开始<span class="arw">→</span></span>' +
        '</div>';

      card.addEventListener('click', function () {
        GH.Audio.play('select');
        location.hash = '#/game/' + g.id;
      });
      gridEl.appendChild(card);
    });
  }

  function renderAchievements() {
    var unlocked = GH.Achievements.unlockedCount();
    achProgEl.textContent = unlocked + ' / ' + GH.Achievements.total() + ' 已解锁';
    U.clear(achListEl);
    GH.Achievements.list.forEach(function (a) {
      var got = GH.Store.isUnlocked(a.id);
      var n = el('div', 'ach' + (got ? ' is-unlocked' : ''));
      n.innerHTML =
        '<div class="ach-ico">' + (got ? a.icon : '🔒') + '</div>' +
        '<div class="ach-txt">' +
          '<div class="ach-name">' + a.name + '</div>' +
          '<div class="ach-desc">' + a.desc + '</div>' +
        '</div>';
      achListEl.appendChild(n);
    });
  }

  function renderHall() {
    renderStats();
    renderTabs();
    renderGrid();
    renderAchievements();
  }

  /* ------------------------ 屏幕方向键 / 滑动 ------------------------ */
  var touchLayer, dpadEl = null, dpadButtons = [];

  function buildDpad(names, roundStyle) {
    if (dpadEl) { dpadEl.remove(); dpadEl = null; }
    dpadButtons = [];
    if (!names || !names.length) return;

    dpadEl = el('div', 'dpad');
    var dirs = names.filter(function (n) { return n === 'up' || n === 'down' || n === 'left' || n === 'right'; });
    var acts = names.filter(function (n) { return dirs.indexOf(n) === -1; });

    if (dirs.length) {
      var cl = el('div', 'dpad-cluster');
      dirs.forEach(function (d) {
        var b = mkBtn(d, 'dpad-' + d);
        cl.appendChild(b);
      });
      dpadEl.appendChild(cl);
    } else {
      dpadEl.appendChild(el('span'));
    }

    if (acts.length) {
      var right = el('div', 'dpad-right');
      acts.forEach(function (a) { right.appendChild(mkBtn(a, 'round')); });
      dpadEl.appendChild(right);
    }
    touchLayer.appendChild(dpadEl);

    function mkBtn(name, cls) {
      var b = el('button', 'dpad-btn ' + cls, glyph(name));
      b.type = 'button';
      b.setAttribute('aria-label', name);
      dpadButtons.push({ name: name, node: b });

      function down(e) { e.preventDefault(); b.classList.add('is-down'); emitKey(name, 'down'); }
      function up(e) { if (e) e.preventDefault(); b.classList.remove('is-down'); emitKey(name, 'up'); }
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', function (e) { if (b.classList.contains('is-down')) up(e); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      return b;
    }
  }

  function glyph(name) {
    switch (name) {
      case 'up': return '▲';
      case 'down': return '▼';
      case 'left': return '◀';
      case 'right': return '▶';
      case 'space': return '●';
      case 'enter': return '↵';
      case 'action': return '●';
      case 'flag': return '🚩';
      case 'reset': return '⟳';
      case 'undo': return '↩';
      default: return String(name).slice(0, 2).toUpperCase();
    }
  }

  /* 滑动 → 方向键 */
  function bindSwipe(target) {
    var sx = 0, sy = 0, active = false;
    var TH = 26;
    var off1 = U.on(target, 'touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; active = true;
    }, { passive: true });
    var off2 = U.on(target, 'touchmove', function (e) {
      if (!active || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - sx;
      var dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
      active = false;
      if (Math.abs(dx) > Math.abs(dy)) {
        emitKey(dx > 0 ? 'right' : 'left', 'down');
        setTimeout(function () { emitKey(dx > 0 ? 'right' : 'left', 'up'); }, 60);
      } else {
        emitKey(dy > 0 ? 'down' : 'up', 'down');
        setTimeout(function () { emitKey(dy > 0 ? 'down' : 'up', 'up'); }, 60);
      }
    }, { passive: true });
    return function () { off1(); off2(); };
  }

  function bindTap(target) {
    return U.on(target, 'pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.dpad')) return;
      emitKey('tap', 'down', { x: e.clientX, y: e.clientY });
    });
  }

  /* ------------------------ 游戏宿主 ------------------------ */
  var viewHall, viewGame, stageEl;
  var hudScore, hudBest, hudName, hudIcon, hudHint;
  var session = null;

  function setHudScore(v) {
    var prev = Number(hudScore.textContent.replace(/[^\d]/g, '')) || 0;
    hudScore.textContent = U.fmtNum(v);
    if (v > prev) {
      hudScore.classList.remove('bump');
      void hudScore.offsetWidth;
      hudScore.classList.add('bump');
    }
  }
  function setHudBest(v) { hudBest.textContent = U.fmtNum(v); }

  function emitKey(name, phase, extra) {
    if (!session) return;
    session.keyHandlers.slice().forEach(function (h) {
      try { h(name, extra || {}, phase); } catch (e) { console.error('[key]', e); }
    });
  }

  function normalizeDpad(def) {
    if (def.dpad && def.dpad.length) return def.dpad;
    var t = String(def.touch || '');
    if (t.indexOf('dpad') === -1) return [];
    var arr = ['up', 'left', 'down', 'right'];
    if (t.indexOf('action') > -1) arr.push('action');
    return arr;
  }

  function endSession(reason) {
    if (!session) return;
    var s = session;
    session = null;
    try { s.bag.dispose(); } catch (e) {}
    try { s.unbinders.forEach(function (f) { f(); }); } catch (e) {}
    try { if (s.handle && s.handle.destroy) s.handle.destroy(); } catch (e) { console.error('[destroy]', e); }
    if (dpadEl) { dpadEl.remove(); dpadEl = null; }
    U.clear(stageEl);
    return s;
  }

  function openGame(id) {
    var def = byId[id];
    if (!def) { location.hash = '#/'; return; }

    endSession('switch');
    GH.UI.closeModal(true);

    current = def;
    viewHall.hidden = true;
    viewGame.hidden = false;
    viewGame.classList.add('is-active');
    document.body.style.overflow = 'hidden';

    var best = GH.Store.getBest(def.id);
    hudName.textContent = def.name;
    hudIcon.textContent = def.icon;
    hudHint.textContent = def.hint || def.desc || '';
    hudScore.textContent = '0';
    setHudBest(best);
    U.clear(stageEl);
    stageEl.scrollTop = 0;

    var s = {
      def: def,
      bag: new U.TimerBag(),
      keyHandlers: [],
      unbinders: [],
      score: 0,
      best: best,
      paused: false,
      finished: false,
      startAt: performance.now(),
      pausedAccum: 0,
      pausedAt: 0,
      handle: null
    };
    session = s;

    /* ---------- 运行时 API ---------- */
    var api = {
      root: stageEl,
      def: def,
      audio: GH.Audio,
      store: GH.Store,
      ui: GH.UI,
      el: el,
      $: U.$,
      $$: U.$$,
      on: U.on,
      clear: U.clear,
      randInt: U.randInt,
      randFloat: U.randFloat,
      choice: U.choice,
      shuffle: U.shuffle,
      chance: U.chance,
      clamp: U.clamp,
      lerp: U.lerp,
      dist: U.dist,
      rgba: U.rgba,
      fmtNum: U.fmtNum,
      fmtClock: U.fmtClock,

      /* --- 定时器（自动清理） --- */
      timeout: function (fn, ms) { return s.bag.timeout(fn, ms); },
      interval: function (fn, ms) { return s.bag.interval(fn, ms); },
      raf: function (fn) { return s.bag.raf(fn); },
      loop: function (fn) { return s.bag.loop(fn); },
      clearTimeout: function (id) { s.bag.clearTimeout(id); },
      clearInterval: function (id) { s.bag.clearInterval(id); },

      /* --- 分数 --- */
      getScore: function () { return s.score; },
      setScore: function (v) { s.score = Math.max(0, Math.round(v || 0)); setHudScore(s.score); return s.score; },
      addScore: function (n) { return api.setScore(s.score + (n || 0)); },
      getBest: function () { return s.best; },

      /* --- 界面 --- */
      setStatus: function (text) {
        var node = stageEl.querySelector('.stage-status');
        if (!node) {
          node = el('div', 'stage-status');
          stageEl.appendChild(node);
        }
        node.textContent = text;
      },
      hint: function (text) {
        var node = stageEl.querySelector('.stage-hint');
        if (!node) { node = el('div', 'stage-hint'); stageEl.appendChild(node); }
        node.innerHTML = text;
      },
      ctrlBar: function () { var n = el('div', 'gctrl'); stageEl.appendChild(n); return n; },
      toast: GH.UI.toast,
      info: GH.UI.info,
      confirm: GH.UI.confirm,

      /* --- 虚拟按键 --- */
      setDpad: function (names) { buildDpad(names || [], true); },

      /* --- 键盘 --- */
      onKey: function (fn) {
        s.keyHandlers.push(fn);
        return function () {
          var i = s.keyHandlers.indexOf(fn);
          if (i > -1) s.keyHandlers.splice(i, 1);
        };
      },
      press: function (name) { emitKey(name, 'down'); emitKey(name, 'up'); },

      /* --- 生命周期 --- */
      isPaused: function () { return s.paused || s.finished; },
      isFinished: function () { return s.finished; },
      restart: function () { restart(); },
      setPaused: function (v) { v ? pauseSession(true) : pauseSession(false); },

      /* --- Canvas 助手 --- */
      canvas: createCanvas,

      /* --- 结束一局 --- */
      finish: function (opts) {
        opts = opts || {};
        if (s.finished) return;
        s.finished = true;

        var seconds = elapsedSeconds();
        var score = opts.noScore ? 0 : s.score;

        var res = GH.Store.submit(def.id, score, {
          win: !!opts.win,
          seconds: seconds,
          metrics: opts.metrics || {}
        });
        s.best = res.best;

        setHudBest(res.best);
        GH.bus.emit('gameover', def.id, score, res);

        var fresh = GH.Achievements.evaluate();
        renderStats();
        renderAchievements();

        GH.UI.result({
          win: !!opts.win,
          icon: opts.icon || (opts.win ? '🏆' : '💥'),
          title: opts.title || (opts.win ? '通关！' : '游戏结束'),
          sub: opts.sub || ('本局用时 ' + U.fmtDuration(seconds)),
          score: opts.noScore ? null : score,
          best: res.best,
          isNew: res.isNew,
          retryText: opts.retryText || '再来一局',
          extra: opts.extra,
          onRetry: function () { restart(); },
          onHome: function () { location.hash = '#/'; }
        });

        /* 成就依次弹出（最多连弹 3 个，其余用 toast 提示） */
        if (fresh.length) {
          var queue = fresh.slice();
          function next() {
            var a = queue.shift();
            if (!a) return;
            GH.UI.achievement(a);
            window.setTimeout(next, 2600);
          }
          window.setTimeout(next, 500);
        }
      }
    };

    /* canvas 助手：世界坐标绘制，自动 contain 适配 + DPR */
    function createCanvas(opts) {
      opts = opts || {};
      var WW = opts.w || 360, WH = opts.h || 640;
      var cvs = document.createElement('canvas');
      var ctx = cvs.getContext('2d');
      stageEl.insertBefore(cvs, stageEl.firstChild);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      function available() {
        var used = 0, siblings = 0;
        Array.prototype.forEach.call(stageEl.children, function (ch) {
          if (ch === cvs) return;
          var cs = window.getComputedStyle(ch);
          used += ch.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
          siblings++;
        });
        var ss = window.getComputedStyle(stageEl);
        var padX = (parseFloat(ss.paddingLeft) || 0) + (parseFloat(ss.paddingRight) || 0);
        var padY = (parseFloat(ss.paddingTop) || 0) + (parseFloat(ss.paddingBottom) || 0);
        var gap = parseFloat(ss.rowGap || ss.gap) || 0;
        return {
          w: Math.max(120, stageEl.clientWidth - padX),
          h: Math.max(120, stageEl.clientHeight - padY - used - gap * siblings)
        };
      }

      function layout() {
        var av = available();
        var sc = Math.min(av.w / WW, av.h / WH);
        sc = Math.max(sc, 0.2);
        var cw = Math.max(60, Math.floor(WW * sc));
        var chh = Math.max(60, Math.floor(WH * sc));
        cvs.style.width = cw + 'px';
        cvs.style.height = chh + 'px';
        cvs.width = Math.floor(cw * dpr);
        cvs.height = Math.floor(chh * dpr);
        var sx = (cw * dpr) / WW, sy = (chh * dpr) / WH;
        ctx.setTransform(sx, 0, 0, sy, 0, 0);
        if (opts.onResize) opts.onResize(WW, WH);
      }

      layout();
      s.bag.timeout(layout, 0);
      var ro = null;
      if (window.ResizeObserver) {
        ro = new ResizeObserver(function () { layout(); });
        ro.observe(stageEl);
      }
      s.unbinders.push(function () { if (ro) ro.disconnect(); });
      s.unbinders.push(U.on(window, 'resize', layout));
      s.unbinders.push(U.on(window, 'orientationchange', function () { s.bag.timeout(layout, 120); }));

      return {
        canvas: cvs,
        ctx: ctx,
        w: WW,
        h: WH,
        resize: layout,
        clear: function (color) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, cvs.width, cvs.height); }
          else ctx.clearRect(0, 0, cvs.width, cvs.height);
          ctx.restore();
        }
      };
    }

    /* ---------- 计时 ---------- */
    function elapsedSeconds() {
      var total = (performance.now() - s.startAt) / 1000;
      var paused = s.pausedAccum;
      if (s.paused && s.pausedAt) paused += (performance.now() - s.pausedAt) / 1000;
      return Math.max(0, Math.round(total - paused));
    }

    /* ---------- 暂停 / 恢复 / 重开 ---------- */
    function restart() {
      var id = def.id;
      endSession('restart');
      // 用微任务避免在事件回调里直接重建
      window.setTimeout(function () { openGame(id); }, 0);
    }

    /* ---------- 挂载游戏 ---------- */
    var dpad = normalizeDpad(def);
    buildDpad(dpad);

    s.unbinders.push(U.on(window, 'keydown', function (e) {
      if (!session) return;
      var name = normKey(e);
      if (PREVENT[name]) e.preventDefault();
      if (!s.paused && !s.finished && def.keys !== false) emitKey(name, 'down', { original: e });
    }));
    s.unbinders.push(U.on(window, 'keyup', function (e) {
      if (!session) return;
      var name = normKey(e);
      if (!s.paused && !s.finished && def.keys !== false) emitKey(name, 'up', { original: e });
    }));

    if (def.touch === 'swipe' || def.touch === 'swipe+dpad') {
      s.unbinders.push(bindSwipe(stageEl));
    }
    if (def.touch === 'tap' || def.tap) {
      s.unbinders.push(bindTap(stageEl));
    }

    try {
      s.handle = def.mount(stageEl, api) || {};
    } catch (e) {
      console.error('[hub] 游戏挂载失败：' + def.id, e);
      U.clear(stageEl);
      var errBox = el('div', 'stage-status', '游戏加载失败：' + (e && e.message ? e.message : '未知错误'));
      stageEl.appendChild(errBox);
    }

    s.bag.loop(function () {
      if (s.finished) return false;
      if (!s.paused && s.handle && s.handle.tick) {
        try { s.handle.tick(); } catch (e) { console.error('[tick]', e); return false; }
      }
      return true;
    });

    stageEl.focus({ preventScroll: true });
  }

  function openHall() {
    endSession('hall');
    current = null;
    GH.UI.closeModal(true);
    viewGame.hidden = true;
    viewGame.classList.remove('is-active');
    viewHall.hidden = false;
    document.body.style.overflow = '';
    renderHall();
    window.scrollTo(0, 0);
  }

  /* ------------------------ 暂停控制（模块级，供 api 与顶栏共用） ------------------------ */
  function pauseSession(flag) {
    var s = session;
    if (!s) return;
    if (flag) {
      if (s.paused || s.finished) return;
      s.paused = true;
      s.pausedAt = performance.now();
      GH.UI.pausePanel({
        sub: '按 P 或点击继续按钮恢复游戏',
        onResume: function () { pauseSession(false); },
        onHome: function () { location.hash = '#/'; }
      });
    } else {
      GH.UI.closeModal(true);
      if (!s.paused) return;
      s.paused = false;
      if (s.pausedAt) {
        s.pausedAccum += (performance.now() - s.pausedAt);
        s.pausedAt = 0;
      }
    }
  }
  GH.pauseSession = pauseSession;

  /* ------------------------ 路由 ------------------------ */
  function route() {
    var h = location.hash || '';
    var m = /^#\/game\/([\w-]+)/.exec(h);
    if (m) {
      if (!current || current.id !== m[1]) openGame(m[1]);
    } else {
      openHall();
    }
  }

  /* ------------------------ 顶栏 / 全局事件 ------------------------ */
  function bindShell() {
    U.on(U.$('#backBtn'), 'click', function () { GH.Audio.play('click'); location.hash = '#/'; });
    U.on(U.$('#restartBtn'), 'click', function () {
      if (!current) return;
      GH.Audio.play('click');
      GH.Hub.reopen(current.id);
    });
    U.on(U.$('#pauseBtn'), 'click', function () {
      if (!session) return;
      GH.Audio.play('click');
      pauseSession(!session.paused);
    });

    U.on(U.$('#fullBtn'), 'click', function () {
      var vg = U.$('#view-game');
      if (document.fullscreenElement) document.exitFullscreen();
      else if (vg.requestFullscreen) vg.requestFullscreen().catch(function () {});
      else GH.UI.toast('当前浏览器不支持全屏', { type: 'warn', icon: '⚠️' });
    });

    /* 全局快捷键 */
    U.on(window, 'keydown', function (e) {
      var name = normKey(e);
      if (name === 'escape') {
        if (GH.UI.isModalOpen()) { GH.UI.closeModal(); return; }
        if (!viewGame.hidden) { location.hash = '#/'; return; }
      }
      if (viewGame.hidden) return;
      if (name === 'p') { U.$('#pauseBtn').click(); }
      if (name === 'r') { U.$('#restartBtn').click(); }
    });

    /* 切到后台自动暂停 */
    U.on(document, 'visibilitychange', function () {
      if (document.hidden && session && !session.paused && !session.finished) {
        pauseSession(true);
      }
    });

    /* 首次交互解锁音频 */
    var unlockOnce = function () {
      GH.Audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
  }

  function bindHallControls() {
    searchInput.addEventListener('input', function () {
      keyword = this.value.trim().toLowerCase();
      renderGrid();
    });

    var soundBtn = U.$('#soundBtn');
    function paintSound() {
      var on = GH.Store.getSetting('sound', true);
      soundBtn.textContent = on ? '🔊' : '🔇';
      soundBtn.classList.toggle('is-off', !on);
    }
    paintSound();
    U.on(soundBtn, 'click', function () {
      var on = !GH.Store.getSetting('sound', true);
      GH.Store.setSetting('sound', on);
      GH.Audio.setEnabled(on);
      paintSound();
      if (on) GH.Audio.play('select');
      GH.UI.toast(on ? '音效已开启' : '音效已关闭', { icon: on ? '🔊' : '🔇' });
    });

    U.on(U.$('#exportBtn'), 'click', function () {
      GH.Audio.play('click');
      var text = GH.Store.exportJSON();
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gamehub-save-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      GH.UI.toast('存档已导出', { type: 'good', icon: '💾' });
    });

    var importFile = U.$('#importFile');
    U.on(U.$('#importBtn'), 'click', function () { importFile.click(); });
    U.on(importFile, 'change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          GH.Store.importJSON(String(reader.result));
          GH.UI.toast('存档已导入', { type: 'good', icon: '📥' });
        } catch (e) {
          GH.UI.toast('导入失败：' + e.message, { type: 'bad', icon: '⚠️' });
        }
      };
      reader.readAsText(f);
      this.value = '';
    });

    U.on(U.$('#resetBtn'), 'click', function () {
      GH.UI.confirm({
        icon: '🗑️',
        title: '清空全部记录？',
        sub: '最高分、成就、统计都会归零，且无法恢复。',
        okText: '确认清空',
        danger: true,
        onOk: function () {
          GH.Store.reset();
          renderHall();
          GH.UI.toast('记录已清空', { icon: '🧹' });
        }
      });
    });
  }

  /* ------------------------ 启动 ------------------------ */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;

    viewHall = U.$('#view-hall');
    viewGame = U.$('#view-game');
    stageEl = U.$('#stage');
    touchLayer = U.$('#touchLayer');
    gridEl = U.$('#gameGrid');
    tabsEl = U.$('#catTabs');
    statsEl = U.$('#hallStats');
    achListEl = U.$('#achList');
    achProgEl = U.$('#achProgress');
    emptyEl = U.$('#emptyState');
    searchInput = U.$('#searchInput');
    hudScore = U.$('#scoreVal');
    hudBest = U.$('#bestVal');
    hudName = U.$('#gameName');
    hudIcon = U.$('#gameIcon');
    hudHint = U.$('#gameHint');

    GH.Audio.setEnabled(GH.Store.getSetting('sound', true));
    GH.Store.markSession();

    bindShell();
    bindHallControls();

    window.addEventListener('hashchange', route);

    GH.bus.on('gameover', function () { renderStats(); });
    GH.bus.on('achievement', function () { renderAchievements(); });

    if (!GH.Store.isAvailable()) {
      GH.UI.toast('浏览器禁用了本地存储，成绩将无法保存', { type: 'warn', icon: '⚠️', duration: 4200 });
    }

    route();
    console.log('%c🎮 小游戏合集已启动 · 共 ' + games.length + ' 款游戏',
      'color:#5b8cff;font-weight:bold');
  }

  GH.Hub = {
    register: register,
    boot: boot,
    get games() { return games; },
    get: function (id) { return byId[id]; },
    categories: CATEGORIES,
    open: function (id) { location.hash = '#/game/' + id; },
    /* 重开当前游戏：销毁并原地重建，不依赖 hash 变化 */
    reopen: function (id) {
      var target = id || (current && current.id);
      endSession('reopen');
      current = null;
      window.setTimeout(function () { openGame(target); }, 0);
    },
    renderHall: renderHall,
    emitKey: emitKey,
    get session() { return session; }
  };
})(window.GH);
