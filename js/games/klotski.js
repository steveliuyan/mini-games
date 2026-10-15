/* ===========================================================
   klotski.js — 华容道（经典「横刀立马」）
   4 列 × 5 行，曹操 2×2 移到最下方中间即通关。
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var COLS = 4, ROWS = 5;

  /* 初始布局：曹操(2×2) 关羽(2×1) 四将(1×2) 四兵(1×1) */
  var DEFS = [
    { id: 'cao',   name: '曹操', x: 1, y: 0, w: 2, h: 2, kind: 'boss' },
    { id: 'zhang', name: '张飞', x: 0, y: 0, w: 1, h: 2, kind: 'tall' },
    { id: 'zhao',  name: '赵云', x: 3, y: 0, w: 1, h: 2, kind: 'tall' },
    { id: 'ma',    name: '马超', x: 0, y: 2, w: 1, h: 2, kind: 'tall' },
    { id: 'huang', name: '黄忠', x: 3, y: 2, w: 1, h: 2, kind: 'tall' },
    { id: 'guan',  name: '关羽', x: 1, y: 2, w: 2, h: 1, kind: 'wide' },
    { id: 's1',    name: '兵', x: 1, y: 3, w: 1, h: 1, kind: 'small' },
    { id: 's2',    name: '兵', x: 2, y: 3, w: 1, h: 1, kind: 'small' },
    { id: 's3',    name: '兵', x: 0, y: 4, w: 1, h: 1, kind: 'small' },
    { id: 's4',    name: '兵', x: 3, y: 4, w: 1, h: 1, kind: 'small' }
  ];

  var TALL_COLORS = ['#5b8cff', '#22d3ee', '#a78bfa', '#2dd4bf'];

  var STYLE = [
    '.kl-board{position:relative;border-radius:14px;background:rgba(255,255,255,.80);',
    'border:1px solid var(--line);box-shadow:var(--shadow-1);touch-action:none;overflow:hidden;}',
    '.kl-exit{position:absolute;left:25%;top:60%;width:50%;height:40%;border-radius:8px;',
    'border:2px dashed rgba(217,61,89,.48);background:rgba(217,61,89,.07);}',
    '.kl-piece{position:absolute;transition:left .16s var(--ease),top .16s var(--ease),',
    'width .16s var(--ease),height .16s var(--ease);cursor:pointer;}',
    '.kl-face{position:absolute;inset:3px;display:grid;place-items:center;border-radius:9px;',
    'font-weight:800;color:#fff;user-select:none;-webkit-user-select:none;',
    'text-shadow:0 1px 2px rgba(0,0,0,.4);',
    'box-shadow:inset 0 -3px 0 rgba(0,0,0,.22),0 3px 10px rgba(0,0,0,.35);',
    'font-size:calc(var(--cell,64px)*.3);line-height:1.15;text-align:center;}',
    '.kl-piece.is-sel .kl-face{box-shadow:inset 0 0 0 2px #fff,0 0 16px rgba(244,63,94,.65);}',
    '.kl-piece.is-movable .kl-face{outline:2px solid rgba(52,211,153,.65);outline-offset:-2px;}',
    '.kl-piece.k-boss .kl-face{font-size:calc(var(--cell,64px)*.36);}',
    '.kl-piece.k-small .kl-face{font-size:calc(var(--cell,64px)*.34);}'
  ].join('');

  GH.Hub.register({
    id: 'klotski',
    name: '华容道',
    icon: '🐎',
    color: '#f43f5e',
    category: 'puzzle',
    tags: ['滑块', '古典', '烧脑'],
    desc: '滑动滑块，把曹操移到最下方出口。',
    hint: '点选滑块后点方向键 / 直接拖动滑块',
    touch: 'dpad',
    dpad: ['up', 'left', 'down', 'right'],

    mount: function (root, api) {
      var pieces = [];
      var steps = 0, done = false, selId = null, cell = 64;

      /* 难度：计分斜率 / 可动滑块高亮提示 */
      var LV = [
        { name: '轻松', per: 6, hint: true },
        { name: '标准', per: 10, hint: false },
        { name: '挑战', per: 16, hint: false }
      ];
      var drag = null;
      var unbinds = [];

      /* ---------------- 结构 ---------------- */
      var style = U.el('style');
      style.textContent = STYLE;
      root.appendChild(style);

      var board = U.el('div', 'kl-board');
      board.appendChild(U.el('div', 'kl-exit'));
      root.appendChild(board);

      api.setStatus('');

      var bar = api.ctrlBar();
      var retry = U.el('button', 'chip', '重开');
      retry.type = 'button';
      retry.addEventListener('click', function () { GH.Audio.play('click'); reset(); });
      bar.appendChild(retry);

      var tip = U.el('button', 'chip', '怎么玩？');
      tip.type = 'button';
      tip.addEventListener('click', function () {
        GH.Audio.play('click');
        api.info({
          icon: '🐎',
          title: '华容道 · 横刀立马',
          html: '点一下滑块把它选中，再按方向键或直接拖拽，'
            + '把它往空白格滑动。<br>把 <b style="color:#d93d59">曹操</b> 移到底部中间的红色出口即通关。'
        });
      });
      bar.appendChild(tip);

      api.hint('点选滑块 → 方向键 / 拖拽移动；曹操 2×2 到最下方中间即通关。');

      /* ---------------- 自适应 ---------------- */
      function fit() {
        var availW = Math.min(root.clientWidth || 360, 460) - 36;
        var availH = (window.innerHeight || 640) - 320;
        cell = U.clamp(Math.floor(Math.min(availW / COLS, availH / ROWS)), 38, 86);
        board.style.width = (cell * COLS) + 'px';
        board.style.height = (cell * ROWS) + 'px';
        board.style.setProperty('--cell', cell + 'px');
      }
      var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(root);

      /* ---------------- 布局 ---------------- */
      function reset() {
        done = false;
        steps = 0;
        selId = null;
        U.clear(board);
        board.appendChild(U.el('div', 'kl-exit'));
        pieces = DEFS.map(function (d) {
          return { id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, kind: d.kind, node: null };
        });

        var tallIdx = 0;
        pieces.forEach(function (p) {
          var n = U.el('div', 'kl-piece k-' + p.kind);
          var face = U.el('div', 'kl-face', p.name);
          n.appendChild(face);
          if (p.kind === 'boss') {
            face.style.background = 'linear-gradient(150deg,#fb7185,#be123c)';
          } else if (p.kind === 'wide') {
            face.style.background = 'linear-gradient(150deg,#fb923c,#c2600d)';
          } else if (p.kind === 'tall') {
            var col = TALL_COLORS[tallIdx++ % TALL_COLORS.length];
            face.style.background = 'linear-gradient(150deg,' + col + ',rgba(0,0,0,.45))';
          } else {
            face.style.background = 'linear-gradient(150deg,#dfe6f3,#b9c5dd)';
            face.style.color = '#101728';
          }
          board.appendChild(n);
          p.node = n;
        });

        fit();
        api.timeout(fit, 0);
        paint();
        api.setScore(scoreOf());
        updateStatus();
      }

      function paint() {
        var mov = lvBar.lv().hint ? movableIds() : [];
        pieces.forEach(function (p) {
          p.node.style.left = (p.x / COLS * 100) + '%';
          p.node.style.top = (p.y / ROWS * 100) + '%';
          p.node.style.width = (p.w / COLS * 100) + '%';
          p.node.style.height = (p.h / ROWS * 100) + '%';
          p.node.classList.toggle('is-sel', p.id === selId);
          if (lvBar.lv().hint) p.node.classList.toggle('is-movable', mov.indexOf(p.id) > -1);
          else p.node.classList.remove('is-movable');
        });
      }

      function scoreOf() {
        return Math.max(0, 3000 - steps * lvBar.lv().per);
      }
      function movableIds() {
        var out = [];
        pieces.forEach(function (p) {
          if (canPlace(p, p.x + 1, p.y) || canPlace(p, p.x - 1, p.y) ||
              canPlace(p, p.x, p.y + 1) || canPlace(p, p.x, p.y - 1)) out.push(p.id);
        });
        return out;
      }
      function updateStatus() {
        api.setStatus('步数 ' + steps + ' · 当前得分 ' + scoreOf());
      }

      /* ---------------- 逻辑 ---------------- */
      function pieceAt(cx, cy) {
        for (var i = 0; i < pieces.length; i++) {
          var p = pieces[i];
          if (cx >= p.x && cx < p.x + p.w && cy >= p.y && cy < p.y + p.h) return p;
        }
        return null;
      }

      function canPlace(p, nx, ny) {
        if (nx < 0 || ny < 0 || nx + p.w > COLS || ny + p.h > ROWS) return false;
        for (var i = 0; i < pieces.length; i++) {
          var q = pieces[i];
          if (q.id === p.id) continue;
          if (nx < q.x + q.w && nx + p.w > q.x && ny < q.y + q.h && ny + p.h > q.y) return false;
        }
        return true;
      }

      function move(dir) {
        if (done || !selId) return false;
        var p = null;
        for (var i = 0; i < pieces.length; i++) if (pieces[i].id === selId) p = pieces[i];
        if (!p) return false;

        var dx = dir === 'left' ? -1 : (dir === 'right' ? 1 : 0);
        var dy = dir === 'up' ? -1 : (dir === 'down' ? 1 : 0);
        if (!canPlace(p, p.x + dx, p.y + dy)) { api.audio.play('tick'); return false; }

        p.x += dx; p.y += dy;
        steps++;
        paint();
        updateStatus();
        api.setScore(scoreOf());
        api.audio.play('move');
        checkWin();
        return true;
      }

      function select(p) {
        selId = p ? p.id : null;
        paint();
      }

      function checkWin() {
        var cao = null;
        for (var i = 0; i < pieces.length; i++) if (pieces[i].id === 'cao') cao = pieces[i];
        if (!cao || cao.x !== 1 || cao.y !== 3) return;
        done = true;
        var sc = scoreOf();
        api.setScore(sc);
        api.audio.play('win');
        api.finish({
          win: true,
          title: '曹操出逃！',
          sub: '共用 ' + steps + ' 步' + (steps <= 116 ? '（已达到最优步数！）' : '（最少 116 步）'),
          icon: '🐎',
          metrics: { klotski_wins: 1, klotski_steps: steps }
        });
      }

      /* ---------------- 输入：键盘 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name === 'up' || name === 'down' || name === 'left' || name === 'right') move(name);
      });

      /* ---------------- 输入：点击 / 拖拽 ---------------- */
      function cellOf(clientX, clientY) {
        var r = board.getBoundingClientRect();
        return {
          cx: Math.floor((clientX - r.left) / (r.width / COLS)),
          cy: Math.floor((clientY - r.top) / (r.height / ROWS))
        };
      }

      unbinds.push(U.on(board, 'pointerdown', function (e) {
        if (done) return;
        var c = cellOf(e.clientX, e.clientY);
        select(pieceAt(c.cx, c.cy));
        drag = { x: e.clientX, y: e.clientY };
        if (board.setPointerCapture) {
          try { board.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }));

      unbinds.push(U.on(board, 'pointermove', function (e) {
        if (!drag || done) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        var th = Math.max(12, cell * 0.26);
        if (Math.abs(dx) < th && Math.abs(dy) < th) return;
        var dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        drag.x = e.clientX;
        drag.y = e.clientY;
        move(dir);
      }));

      unbinds.push(U.on(board, 'pointerup', function () { drag = null; }));
      unbinds.push(U.on(board, 'pointercancel', function () { drag = null; }));

      var lvBar = api.levelBar({
        levels: LV, label: '难度', dflt: 1,
        onPick: function () { reset(); }
      });

      reset();

      return {
        destroy: function () {
          if (ro) ro.disconnect();
          unbinds.forEach(function (f) { f(); });
        },
        restart: reset
      };
    }
  });
})(window.GH);
