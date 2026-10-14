/* ===========================================================
   g2048.js — 2048（DOM 网格样板游戏）
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var COLORS = {
    2:    ['#eef2fa', '#5b6785'],
    4:    ['#e2e9f8', '#495880'],
    8:    ['#ffd8a8', '#8a4b09'],
    16:   ['#ffbe76', '#7a3d02'],
    32:   ['#ffa94d', '#5c2a00'],
    64:   ['#ff922b', '#5c2a00'],
    128:  ['#8b5cf6', '#ffffff'],
    256:  ['#7c3aed', '#ffffff'],
    512:  ['#6366f1', '#ffffff'],
    1024: ['#4f46e5', '#ffffff'],
    2048: ['#4338ca', '#ffffff'],
    4096: ['#e11d48', '#ffffff'],
    8192: ['#be123c', '#ffffff']
  };
  var BIG = ['#a21caf', '#ffffff'];

  GH.Hub.register({
    id: 'g2048',
    name: '2048',
    icon: '🔢',
    color: '#fbbf24',
    category: 'classic',
    tags: ['数字', '益智', '耐玩'],
    desc: '滑动合并相同数字，目标合成 2048。',
    hint: '方向键 / WASD 滑动，手机可直接划屏',
    touch: 'swipe',

    mount: function (root, api) {
      var SIZE = 4;
      var grid, score, maxTile, over, won, mergedMask, busy;

      var board = U.el('div', 'board');
      board.style.gridTemplateColumns = 'repeat(' + SIZE + ', var(--cell))';
      board.style.setProperty('--cell', '76px');
      root.appendChild(board);

      var status = U.el('div', 'stage-status');
      root.appendChild(status);

      var hint = U.el('div', 'stage-hint',
        '合并同数字方块，<b style="color:#b8760a">合成 2048</b> 即可通关，之后可继续冲分。');
      root.appendChild(hint);

      /* ---------------- 布局自适应 ---------------- */
      function fit() {
        var avail = root.clientWidth - 40;
        var cell = U.clamp(Math.floor((avail - (SIZE + 1) * 5 - 18) / SIZE), 42, 88);
        board.style.setProperty('--cell', cell + 'px');
      }
      fit();
      api.timeout(fit, 0);
      var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(root);

      /* ---------------- 逻辑 ---------------- */
      function reset() {
        grid = [];
        for (var r = 0; r < SIZE; r++) {
          grid.push([0, 0, 0, 0]);
        }
        score = 0;
        maxTile = 0;
        over = false;
        won = false;
        busy = false;
        mergedMask = emptyMask();
        addTile();
        addTile();
        api.setScore(0);
        render();
        updateStatus();
      }

      function emptyMask() {
        return [
          [false, false, false, false],
          [false, false, false, false],
          [false, false, false, false],
          [false, false, false, false]
        ];
      }

      function empties() {
        var list = [];
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) if (!grid[r][c]) list.push([r, c]);
        }
        return list;
      }

      function addTile() {
        var e = empties();
        if (!e.length) return null;
        var pick = e[Math.floor(Math.random() * e.length)];
        var v = Math.random() < 0.9 ? 2 : 4;
        grid[pick[0]][pick[1]] = v;
        if (v > maxTile) maxTile = v;
        return pick;
      }

      function coords(dir) {
        var out = [];
        var r, c;
        if (dir === 'left' || dir === 'right') {
          for (r = 0; r < SIZE; r++) {
            for (var i = 0; i < SIZE; i++) {
              c = dir === 'left' ? i : SIZE - 1 - i;
              out.push([r, c]);
            }
          }
        } else {
          for (c = 0; c < SIZE; c++) {
            for (var j = 0; j < SIZE; j++) {
              r = dir === 'up' ? j : SIZE - 1 - j;
              out.push([r, c]);
            }
          }
        }
        return out;
      }

      function move(dir) {
        if (over || busy) return;
        var coordsList = coords(dir);
        var moved = false;
        var newMask = emptyMask();
        var gained = 0;

        for (var line = 0; line < SIZE; line++) {
          var slice = coordsList.slice(line * SIZE, line * SIZE + SIZE);
          var vals = slice.map(function (p) { return grid[p[0]][p[1]]; });
          var arr = vals.filter(function (v) { return v > 0; });
          var out = [];
          var outIsMerge = [];
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] === arr[i + 1]) {
              out.push(arr[i] * 2);
              outIsMerge.push(true);
              gained += arr[i] * 2;
              i++;
            } else {
              out.push(arr[i]);
              outIsMerge.push(false);
            }
          }
          while (out.length < SIZE) { out.push(0); outIsMerge.push(false); }

          for (var k = 0; k < SIZE; k++) {
            var p = slice[k];
            if (grid[p[0]][p[1]] !== out[k]) moved = true;
            grid[p[0]][p[1]] = out[k];
            newMask[p[0]][p[1]] = outIsMerge[k];
          }
        }

        if (!moved) {
          api.audio.play('tick');
          return;
        }

        mergedMask = newMask;
        score += gained;
        if (gained) api.audio.play('score'); else api.audio.play('move');
        api.setScore(score);

        if (!won && tileExists(2048)) {
          won = true;
          api.audio.play('levelup');
          api.toast('合成 2048！继续挑战更高分', { type: 'good', icon: '🏆', duration: 3000 });
        }

        addTile();
        render();
        updateStatus();

        if (!canMove()) endGame();
      }

      function tileExists(v) {
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) if (grid[r][c] === v) return true;
        }
        return false;
      }

      function canMove() {
        if (empties().length) return true;
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) {
            var v = grid[r][c];
            if (c < SIZE - 1 && grid[r][c + 1] === v) return true;
            if (r < SIZE - 1 && grid[r + 1][c] === v) return true;
          }
        }
        return false;
      }

      function endGame() {
        over = true;
        api.audio.play('lose');
        api.finish({
          win: won,
          title: won ? '通关！' : '无路可走',
          sub: won ? '你合成出了 2048' : '棋盘已满，无法再合并',
          icon: won ? '🏆' : '🧱',
          metrics: { g2048_max: maxTile, g2048_score: score }
        });
      }

      /* ---------------- 渲染 ---------------- */
      function render() {
        U.clear(board);
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) {
            var v = grid[r][c];
            var cell = U.el('div', 'cell');
            if (v) {
              var col = COLORS[v] || BIG;
              cell.style.background = col[0];
              cell.style.color = col[1];
              cell.style.fontWeight = '800';
              cell.style.boxShadow = 'inset 0 -2px 0 rgba(0,0,0,.18)';
              cell.textContent = v;
              if (v >= 1024) cell.style.fontSize = 'calc(var(--cell) * .3)';
              if (mergedMask[r][c] && cell.animate) {
                cell.animate(
                  [{ transform: 'scale(.6)', opacity: .4 }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
                  { duration: 190, easing: 'cubic-bezier(.22,1,.36,1)' }
                );
              }
            }
            board.appendChild(cell);
          }
        }
        mergedMask = emptyMask();
      }

      function updateStatus() {
        var vals = [];
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) vals.push(grid[r][c]);
        }
        var max = Math.max.apply(null, vals);
        status.textContent = '最大方块 ' + (max || 0) + ' · 空格 ' + empties().length;
      }

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name === 'up' || name === 'down' || name === 'left' || name === 'right') move(name);
      });

      /* ---------------- 按钮 ---------------- */
      var bar = api.ctrlBar();
      var retry = U.el('button', 'chip', '重新开始');
      retry.addEventListener('click', function () { GH.Audio.play('click'); reset(); });
      bar.appendChild(retry);

      reset();
      return {
        destroy: function () { if (ro) ro.disconnect(); },
        restart: reset
      };
    }
  });
})(window.GH);
