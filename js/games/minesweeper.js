/* ===========================================================
   minesweeper.js — 扫雷（DOM 网格）
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var LEVELS = [
    { id: 'easy', name: '初级', n: 9,  mines: 10, base: 1200 },
    { id: 'mid',  name: '中级', n: 12, mines: 24, base: 2400 },
    { id: 'hard', name: '高级', n: 16, mines: 50, base: 3600 }
  ];

  /* 经典数字配色：1 蓝 2 绿 3 红 4 深蓝 5 棕 6 青 7 黑 8 灰 */
  var NUM_COLOR = ['', '#2563eb', '#16a34a', '#dc2626', '#1e3a8a',
                   '#92400e', '#0891b2', '#111827', '#6b7280'];

  GH.Hub.register({
    id: 'minesweeper',
    name: '扫雷',
    icon: '🚩',
    color: '#22d3ee',
    category: 'classic',
    tags: ['经典', '益智', '烧脑'],
    desc: '点开所有空格，避开地雷并标出它们。',
    hint: '点击揭开 · 右键/长按插旗 · 手机可开标记模式',
    touch: 'tap',

    mount: function (root, api) {
      var n = 9, mineCount = 10, base = 1200;
      var mine, open, flag, num, cellEls;
      var started, over, elapsed, timerId, flagMode = false;
      var revealed, flags, pressTimer = 0, suppressClick = false;

      /* ---------------- 棋盘 ---------------- */
      var board = U.el('div', 'board');
      board.style.webkitTouchCallout = 'none';
      root.appendChild(board);

      /* ---------------- 难度 / 标记模式 ---------------- */
      var lvBar = api.levelBar({
        levels: LEVELS,
        label: '难度',
        dflt: 0,
        onPick: function (idx) {
          levelIdx = idx;
          reset(idx);
        }
      });
      var levelIdx = lvBar.cur();

      var bar = api.ctrlBar();
      var flagBtn = U.el('button', 'chip', '🚩 标记模式');
      flagBtn.type = 'button';
      flagBtn.addEventListener('click', function () {
        flagMode = !flagMode;
        flagBtn.classList.toggle('is-active', flagMode);
        GH.Audio.play('click');
        api.toast(flagMode ? '标记模式：点击即插旗' : '已退出标记模式', { icon: '🚩', duration: 1400 });
      });
      bar.appendChild(flagBtn);

      /* ---------------- 自适应 ---------------- */
      function fit() {
        var gap = n <= 9 ? 5 : (n <= 12 ? 4 : 3);
        var availW = Math.max(160, root.clientWidth - 40);
        var byW = Math.floor((availW - (n + 1) * gap - 20) / n);
        var hh = root.clientHeight;
        var byH = 999;
        if (hh > 260) byH = Math.floor((hh - 168 - (n + 1) * gap) / n);
        board.style.gap = gap + 'px';
        board.style.setProperty('--cell', U.clamp(Math.min(byW, byH), 16, 46) + 'px');
      }
      api.timeout(fit, 0);
      var ro = window.ResizeObserver ? new ResizeObserver(function () { fit(); }) : null;
      if (ro) ro.observe(root);

      /* ---------------- 工具 ---------------- */
      function fill(v) {
        var a = [];
        for (var i = 0; i < n; i++) a.push(v);
        return a;
      }

      function eachNeighbor(r, c, fn) {
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            var nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < n && nc >= 0 && nc < n) fn(nr, nc);
          }
        }
      }

      function updateStatus() {
        var left = mineCount - flags;
        if (left < 0) left = 0;
        api.setStatus('⏱ ' + elapsed + 's · 💣 剩 ' + left + ' · ' +
          LEVELS[levelIdx].name + ' ' + n + '×' + n);
      }

      /* ---------------- 渲染单元格 ---------------- */
      function paintHidden(el) {
        el.textContent = '';
        el.style.color = '';
        el.style.fontSize = '';
        el.style.background = 'linear-gradient(180deg,#dde5f3,#bfcbe3)';
        el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.85), 0 1px 2px rgba(24,38,82,.20)';
      }

      function paint(r, c) {
        var el = cellEls[r][c];
        if (open[r][c]) {
          el.style.background = 'rgba(248, 250, 253, .95)';
          el.style.boxShadow = 'none';
          el.style.fontSize = '';
          if (num[r][c] > 0) {
            el.textContent = num[r][c];
            el.style.color = NUM_COLOR[num[r][c]];
          } else {
            el.textContent = '';
            el.style.color = '';
          }
        } else if (flag[r][c]) {
          paintHidden(el);
          el.textContent = '🚩';
          el.style.fontSize = 'calc(var(--cell) * .56)';
        } else {
          paintHidden(el);
        }
      }

      /* ---------------- 开局 / 布雷 ---------------- */
      function buildBoard() {
        U.clear(board);
        board.style.gridTemplateColumns = 'repeat(' + n + ', var(--cell))';
        cellEls = [];
        for (var r = 0; r < n; r++) {
          var row = [];
          for (var c = 0; c < n; c++) {
            var cell = U.el('div', 'cell');
            cell.setAttribute('data-r', r);
            cell.setAttribute('data-c', c);
            paintHidden(cell);
            board.appendChild(cell);
            row.push(cell);
          }
          cellEls.push(row);
        }
        fit();
      }

      function reset(idx) {
        if (typeof idx === 'number') levelIdx = idx;
        var lv = LEVELS[levelIdx];
        n = lv.n; mineCount = lv.mines; base = lv.base;

        started = false; over = false; elapsed = 0;
        revealed = 0; flags = 0;
        pressTimer = 0; suppressClick = false;

        mine = []; open = []; flag = []; num = [];
        for (var r = 0; r < n; r++) {
          mine.push(fill(false));
          open.push(fill(false));
          flag.push(fill(false));
          num.push(fill(0));
        }
        buildBoard();
        api.setScore(0);

        // 计时器：用 api.interval，销毁时自动清理
        if (timerId) api.clearInterval(timerId);
        timerId = api.interval(function () {
          if (api.isPaused() || over || !started) return;
          elapsed++;
          updateStatus();
        }, 1000);
        updateStatus();
      }

      /* 首点之后布雷：首点及其 8 邻格保证无雷 */
      function placeMines(sr, sc) {
        var pool = [], r, c;
        for (r = 0; r < n; r++) {
          for (c = 0; c < n; c++) {
            var near = (r >= sr - 1 && r <= sr + 1 && c >= sc - 1 && c <= sc + 1);
            if (!near) pool.push([r, c]);
          }
        }
        api.shuffle(pool);
        var total = Math.min(mineCount, pool.length);
        for (var i = 0; i < total; i++) mine[pool[i][0]][pool[i][1]] = true;

        for (r = 0; r < n; r++) {
          for (c = 0; c < n; c++) {
            var k = 0;
            eachNeighbor(r, c, function (nr, nc) { if (mine[nr][nc]) k++; });
            num[r][c] = k;
          }
        }
      }

      /* ---------------- 操作 ---------------- */
      function reveal(r, c) {
        if (over || r < 0 || c < 0 || r >= n || c >= n) return;
        if (open[r][c] || flag[r][c]) return;
        if (!started) { started = true; placeMines(r, c); }
        if (mine[r][c]) { boom(r, c); return; }

        // BFS 洪水展开
        var q = [[r, c]];
        while (q.length) {
          var p = q.shift(), pr = p[0], pc = p[1];
          if (pr < 0 || pc < 0 || pr >= n || pc >= n) continue;
          if (open[pr][pc] || flag[pr][pc] || mine[pr][pc]) continue;
          open[pr][pc] = true;
          revealed++;
          paint(pr, pc);
          if (num[pr][pc] === 0) {
            eachNeighbor(pr, pc, function (nr, nc) {
              if (!open[nr][nc]) q.push([nr, nc]);
            });
          }
        }

        var first = cellEls[r][c];
        if (first.animate) {
          first.animate(
            [{ transform: 'scale(.82)' }, { transform: 'scale(1)' }],
            { duration: 150, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        }
        api.audio.play('select');
        updateStatus();
        if (revealed === n * n - mineCount) win();
      }

      function toggleFlag(r, c) {
        if (over || open[r][c]) return;
        flag[r][c] = !flag[r][c];
        flags += flag[r][c] ? 1 : -1;
        paint(r, c);
        api.audio.play(flag[r][c] ? 'coin' : 'tick');
        updateStatus();
      }

      function boom(r, c) {
        over = true;
        if (timerId) { api.clearInterval(timerId); timerId = 0; }
        open[r][c] = true;
        var el = cellEls[r][c];
        el.textContent = '💣';
        el.style.fontSize = 'calc(var(--cell) * .56)';
        el.style.background = '#ef4444';
        el.style.boxShadow = '0 0 14px rgba(239,68,68,.85)';

        for (var r2 = 0; r2 < n; r2++) {
          for (var c2 = 0; c2 < n; c2++) {
            if (r2 === r && c2 === c) continue;
            var e2 = cellEls[r2][c2];
            if (mine[r2][c2] && !flag[r2][c2]) {
              e2.textContent = '💣';
              e2.style.fontSize = 'calc(var(--cell) * .56)';
              e2.style.background = 'rgba(239,68,68,.16)';
              e2.style.boxShadow = 'none';
            } else if (!mine[r2][c2] && flag[r2][c2]) {
              e2.textContent = '❌';
              e2.style.fontSize = 'calc(var(--cell) * .56)';
            }
          }
        }
        api.audio.play('explode');
        api.setScore(0);
        api.finish({
          title: '踩到地雷了',
          sub: '用时 ' + elapsed + ' 秒 · 已揭开 ' + revealed + ' 格',
          icon: '💥'
        });
      }

      function win() {
        if (over) return;
        over = true;
        if (timerId) { api.clearInterval(timerId); timerId = 0; }
        api.setScore(Math.max(60, base - elapsed));
        api.audio.play('win');
        api.finish({
          win: true,
          title: '扫雷成功！',
          sub: LEVELS[levelIdx].name + ' ' + n + '×' + n + ' · 用时 ' + elapsed + ' 秒',
          icon: '🚩',
          metrics: { mine_wins: 1, mine_best_time: -Math.max(1, elapsed) }
        });
      }

      /* ---------------- 事件 ---------------- */
      function cellOf(target) {
        var el = target;
        while (el && el !== board) {
          if (el.classList && el.classList.contains('cell')) return el;
          el = el.parentNode;
        }
        return null;
      }

      api.on(board, 'click', function (e) {
        var cell = cellOf(e.target);
        if (!cell) return;
        if (suppressClick) { suppressClick = false; return; }
        var r = +cell.getAttribute('data-r'), c = +cell.getAttribute('data-c');
        if (flagMode) toggleFlag(r, c);
        else reveal(r, c);
      });

      api.on(board, 'contextmenu', function (e) {
        e.preventDefault();
        var cell = cellOf(e.target);
        if (!cell) return;
        toggleFlag(+cell.getAttribute('data-r'), +cell.getAttribute('data-c'));
      });

      // 触屏长按插旗（鼠标不触发，避免误插旗）
      api.on(board, 'pointerdown', function (e) {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        var cell = cellOf(e.target);
        if (!cell) return;
        var r = +cell.getAttribute('data-r'), c = +cell.getAttribute('data-c');
        pressTimer = api.timeout(function () {
          pressTimer = 0;
          suppressClick = true;
          toggleFlag(r, c);
        }, 420);
      });

      function cancelPress() {
        if (pressTimer) { api.clearTimeout(pressTimer); pressTimer = 0; }
      }
      api.on(board, 'pointerup', cancelPress);
      api.on(board, 'pointercancel', cancelPress);
      api.on(board, 'pointerleave', cancelPress);

      /* ---------------- 启动 ---------------- */
      reset();
      api.hint('数字表示周围 8 格的雷数；右键 / 长按插旗，手机可先开 <b style="color:#0d95ab">标记模式</b> 再点击插旗。');

      return {
        destroy: function () { if (ro) ro.disconnect(); },
        restart: function () { reset(levelIdx); }
      };
    }
  });
})(window.GH);
