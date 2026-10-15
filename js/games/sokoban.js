/* ===========================================================
   sokoban.js — 推箱子（DOM 实现）
   字符地图：# 墙 / 空格 地板 / . 目标 / $ 箱子 / * 箱子在目标上
             @ 玩家 / + 玩家在目标上
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  /* 6 个内联关卡，均由地图推演验证可解（难度递增） */
  var LEVELS = [
    [ /* 1 · 5 步：右·下·右·上·上 */
      '#######',
      '#     #',
      '#   . #',
      '#     #',
      '# @$  #',
      '#     #',
      '#######'
    ],
    [ /* 2 · 把箱子拐进壁龛 */
      '#########',
      '#       #',
      '#  ###  #',
      '#  #.#  #',
      '#  # #  #',
      '#  $@   #',
      '#       #',
      '#########'
    ],
    [ /* 3 · 两箱两目标 */
      '#########',
      '#  . .  #',
      '#       #',
      '#       #',
      '#  $ $  #',
      '#   @   #',
      '#########'
    ],
    [ /* 4 · 左右两间用一条走廊连通 */
      '#########',
      '#   #   #',
      '# . # . #',
      '#   #   #',
      '##$###$##',
      '#       #',
      '#   @   #',
      '#########'
    ],
    [ /* 5 · 三箱一排推上去 */
      '##########',
      '#        #',
      '#  ...   #',
      '#        #',
      '#  $$$   #',
      '#   @    #',
      '##########'
    ],
    [ /* 6 · 两个箱子分开处理 */
      '##########',
      '#        #',
      '#  #  #  #',
      '#  #..#  #',
      '#  #  #  #',
      '#  $ $   #',
      '#   @    #',
      '##########'
    ]
  ];

  var STYLE = [
    '.sk-wrap{display:flex;align-items:center;justify-content:center;}',
    '.sk-board{--cell:44px;position:relative;display:grid;border-radius:12px;padding:4px;',
    'background:rgba(255,255,255,.80);border:1px solid var(--line);box-shadow:var(--shadow-1);',
    'touch-action:manipulation;}',
    '.sk-t{position:relative;display:grid;place-items:center;width:var(--cell);height:var(--cell);}',
    '.sk-ti{width:calc(100% - 3px);height:calc(100% - 3px);border-radius:4px;background:rgba(24,38,82,.04);}',
    '.sk-t.is-wall .sk-ti{background:linear-gradient(150deg,#ccd6e8,#adb9d5);',
    'box-shadow:inset 0 -2px 0 rgba(24,38,82,.20);border-radius:5px;}',
    '.sk-t.is-goal .sk-ti{background:rgba(184,118,10,.14);border-radius:6px;',
    'box-shadow:inset 0 0 0 2px rgba(184,118,10,.45);}',
    '.sk-t.is-goal .sk-ti::after{content:"";width:30%;height:30%;border-radius:50%;background:rgba(184,118,10,.70);}',
    '.sk-layer{position:absolute;left:4px;top:4px;right:4px;bottom:4px;pointer-events:none;}',
    '.sk-box{position:absolute;left:0;top:0;border-radius:4px;',
    'background:linear-gradient(150deg,#fb923c,#e97d16);',
    'box-shadow:inset 0 0 0 2px rgba(0,0,0,.16),0 3px 10px rgba(24,38,82,.22);',
    'transition:transform .13s var(--ease),background .18s var(--ease);}',
    '.sk-box::after{content:"";position:absolute;inset:24%;border-radius:3px;',
    'border:2px solid rgba(255,255,255,.55);}',
    '.sk-box.is-done{background:linear-gradient(150deg,#34d399,#0fae7c);}',
    '.sk-man{position:absolute;left:0;top:0;border-radius:50%;',
    'background:radial-gradient(circle at 34% 28%,#9ec1ff,#3b6cf0 70%);',
    'box-shadow:0 3px 10px rgba(24,38,82,.28),inset 0 -2px 0 rgba(24,38,82,.15);',
    'transition:transform .13s var(--ease);}',
    '.sk-man::before,.sk-man::after{content:"";position:absolute;top:34%;width:17%;height:17%;',
    'border-radius:50%;background:#ffffff;}',
    '.sk-man::before{left:24%;}',
    '.sk-man::after{right:24%;}'
  ].join('');

  GH.Hub.register({
    id: 'sokoban',
    name: '推箱子',
    icon: '📦',
    color: '#fb923c',
    category: 'puzzle',
    tags: ['推箱', '经典', '烧脑'],
    desc: '把箱子推到目标点，全部归位即通关。',
    hint: '方向键 / 滑动推箱，U 键撤销',
    touch: 'swipe+dpad',
    dpad: ['up', 'left', 'down', 'right', 'undo'],

    mount: function (root, api) {
      var li = 0;              // 当前关卡
      var cols = 0, rows = 0, cell = 44;
      var walls = [], goals = [], goalMap = {};
      var boxes = [], player = { x: 0, y: 0 };
      var steps = 0, history = [], total = 0, totalSteps = 0;
      var locked = false, done = false;
      var boxNodes = [], manNode = null;

      /* ---------------- 结构 ---------------- */
      var style = U.el('style');
      style.textContent = STYLE;
      root.appendChild(style);

      var wrap = U.el('div', 'sk-wrap');
      var board = U.el('div', 'sk-board');
      var layer = U.el('div', 'sk-layer');
      wrap.appendChild(board);
      root.appendChild(wrap);

      api.setStatus('');

      var LV = [
        { name: '轻松', undos: 10 },
        { name: '标准', undos: 3 },
        { name: '挑战', undos: 0 }
      ];
      var undoLeft = 3;
      var lvBar = api.levelBar({
        levels: LV, label: '难度', dflt: 1,
        onPick: function (i, lv) { undoLeft = lv.undos; load(li); }
      });
      var bar = api.ctrlBar();
      var undoBtn = U.el('button', 'chip', '↩ 撤销');
      undoBtn.type = 'button';
      undoBtn.addEventListener('click', function () { GH.Audio.play('click'); undo(); });
      bar.appendChild(undoBtn);

      var retry = U.el('button', 'chip', '重开本关');
      retry.type = 'button';
      retry.addEventListener('click', function () { GH.Audio.play('click'); load(li); });
      bar.appendChild(retry);

      var prev = U.el('button', 'chip', '上一关');
      prev.type = 'button';
      prev.addEventListener('click', function () {
        if (li === 0) { api.toast('已经是第一关', { type: 'warn', icon: '⚠️' }); return; }
        GH.Audio.play('click');
        load(li - 1);
      });
      bar.appendChild(prev);

      api.hint('把 <b style="color:#c2570a">箱子</b> 推到 <b style="color:#b8760a">目标点</b>；推错了可以撤销。');

      /* ---------------- 自适应 ---------------- */
      function fit() {
        var availW = Math.min(root.clientWidth || 360, 640) - 36;
        var availH = (window.innerHeight || 640) - 300;
        cell = U.clamp(Math.floor(Math.min((availW - 10) / cols, (availH - 10) / rows)), 20, 54);
        board.style.setProperty('--cell', cell + 'px');
        board.style.gridTemplateColumns = 'repeat(' + cols + ', var(--cell))';
        board.style.gridTemplateRows = 'repeat(' + rows + ', var(--cell))';
        paintEntities();
      }
      var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(root);

      /* ---------------- 关卡加载 ---------------- */
      function load(i) {
        li = i;
        var map = LEVELS[i];
        rows = map.length;
        cols = map[0].length;
        walls = []; goals = []; goalMap = {};
        boxes = [];
        locked = false;

        U.clear(board);
        for (var r = 0; r < rows; r++) {
          walls[r] = [];
          for (var c = 0; c < cols; c++) {
            var ch = map[r].charAt(c);
            walls[r][c] = ch === '#';
            if (ch === '.' || ch === '*' || ch === '+') {
              goals.push({ x: c, y: r });
              goalMap[c + ',' + r] = true;
            }
            if (ch === '$' || ch === '*') boxes.push({ x: c, y: r });
            if (ch === '@' || ch === '+') player = { x: c, y: r };

            var t = U.el('div', 'sk-t' + (walls[r][c] ? ' is-wall' : (goalMap[c + ',' + r] ? ' is-goal' : '')));
            t.appendChild(U.el('div', 'sk-ti'));
            board.appendChild(t);
          }
        }

        /* 实体层：箱子 + 玩家 */
        U.clear(layer);
        boxNodes = boxes.map(function () {
          var n = U.el('div', 'sk-box');
          layer.appendChild(n);
          return n;
        });
        manNode = U.el('div', 'sk-man');
        layer.appendChild(manNode);
        if (!layer.parentNode) board.appendChild(layer);

        steps = 0;
        history = [];
        undoLeft = lvBar.lv().undos;
        fit();
        api.timeout(fit, 0);
        paintEntities();
        updateStatus();
        updateScore();
      }

      /* ---------------- 绘制实体 ---------------- */
      function isWall(x, y) {
        if (y < 0 || y >= rows || x < 0 || x >= cols) return true;
        return !!walls[y][x];
      }
      function boxAt(x, y) {
        for (var i = 0; i < boxes.length; i++) {
          if (boxes[i].x === x && boxes[i].y === y) return i;
        }
        return -1;
      }
      function place(node, x, y) {
        if (!node) return;
        var inset = Math.max(2, cell * 0.06);
        node.style.width = (cell - inset * 2) + 'px';
        node.style.height = (cell - inset * 2) + 'px';
        node.style.transform = 'translate(' + (x * cell + inset) + 'px,' + (y * cell + inset) + 'px)';
      }
      function paintEntities() {
        for (var i = 0; i < boxes.length; i++) {
          place(boxNodes[i], boxes[i].x, boxes[i].y);
          boxNodes[i].classList.toggle('is-done', !!goalMap[boxes[i].x + ',' + boxes[i].y]);
        }
        place(manNode, player.x, player.y);
      }

      function updateStatus() {
        var on = 0;
        boxes.forEach(function (b) { if (goalMap[b.x + ',' + b.y]) on++; });
        api.setStatus('第 ' + (li + 1) + '/' + LEVELS.length + ' 关 · 步数 ' + steps +
          ' · 归位 ' + on + '/' + goals.length +
          ' · 撤销 ' + undoLeft + (lvBar.lv().undos > 0 ? '' : '（挑战：禁用）'));
      }
      function potential() { return Math.max(0, 800 - steps * 5); }
      function updateScore() { api.setScore(done ? total : total + potential()); }

      /* ---------------- 移动 ---------------- */
      function snapshot() {
        return {
          p: { x: player.x, y: player.y },
          b: boxes.map(function (b) { return { x: b.x, y: b.y }; }),
          s: steps
        };
      }

      function step(dx, dy) {
        if (locked || done) return;
        var nx = player.x + dx, ny = player.y + dy;
        if (isWall(nx, ny)) { api.audio.play('tick'); return; }

        var bi = boxAt(nx, ny);
        if (bi >= 0) {
          var bx = nx + dx, by = ny + dy;
          if (isWall(bx, by) || boxAt(bx, by) >= 0) { api.audio.play('tick'); return; }
          history.push(snapshot());
          boxes[bi].x = bx; boxes[bi].y = by;
          api.audio.play('bounce');
        } else {
          history.push(snapshot());
          api.audio.play('move');
        }
        player.x = nx; player.y = ny;
        steps++;
        totalSteps++;
        paintEntities();
        updateStatus();
        updateScore();
        checkClear();
      }

      function undo() {
        if (locked || done || !history.length) return;
        if (undoLeft <= 0) {
          api.toast(undoLeft === 0 && lvBar.lv().undos === 0 ? '挑战难度不可撤销' : '撤销次数已用完', { type: 'warn', icon: '⚠️' });
          api.audio.play('tick');
          return;
        }
        undoLeft--;
        var h = history.pop();
        player = { x: h.p.x, y: h.p.y };
        boxes = h.b;
        steps = h.s;
        paintEntities();
        updateStatus();
        updateScore();
      }

      function checkClear() {
        for (var i = 0; i < goals.length; i++) {
          if (boxAt(goals[i].x, goals[i].y) < 0) return;
        }
        locked = true;
        var gained = potential();
        total += gained;
        api.audio.play('levelup');
        updateStatus();

        if (li === LEVELS.length - 1) {
          done = true;
          total += 1000;               // 全关通关奖励
          api.setScore(total);
          api.finish({
            win: true,
            title: '全部关卡完成！',
            sub: '6 关共走 ' + totalSteps + ' 步 · 过关奖励 +1000',
            icon: '📦',
            metrics: { sokoban_wins: 1, sokoban_levels: LEVELS.length, sokoban_steps: totalSteps }
          });
          return;
        }

        api.toast('第 ' + (li + 1) + ' 关完成 +' + gained + ' 分', { type: 'good', icon: '✅' });
        api.timeout(function () { load(li + 1); }, 900);
      }

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name === 'up') step(0, -1);
        else if (name === 'down') step(0, 1);
        else if (name === 'left') step(-1, 0);
        else if (name === 'right') step(1, 0);
        else if (name === 'undo' || name === 'u' || name === 'z') undo();
      });

      load(0);

      return {
        destroy: function () { if (ro) ro.disconnect(); },
        restart: function () { load(0); }
      };
    }
  });
})(window.GH);
