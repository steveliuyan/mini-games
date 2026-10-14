/* ===========================================================
   tetris.js — 俄罗斯方块（Canvas）
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var COLS = 10, ROWS = 20, CELL = 30;
  var W = COLS * CELL, H = ROWS * CELL;
  var DT = 1000 / 60;      // 每帧毫秒
  var LOCK_MS = 480;       // 落地锁定延迟
  var CLEAR_MS = 220;      // 消行闪白时长

  /* 7 种标准方块：box 为旋转盒边长，cells 为 SRS 起始朝向的占位 */
  var PIECES = [
    { k: 'I', c: '#22d3ee', box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    { k: 'O', c: '#fbbf24', box: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { k: 'T', c: '#a78bfa', box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    { k: 'S', c: '#34d399', box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { k: 'Z', c: '#fb7185', box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    { k: 'J', c: '#5b8cff', box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    { k: 'L', c: '#fb923c', box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
  ];

  /* 在 box 内顺时针旋转 90°，生成 4 个朝向（即 SRS 四处朝向） */
  function rot4(p) {
    var out = [], cur = p.cells;
    for (var i = 0; i < 4; i++) {
      out.push(cur);
      cur = cur.map(function (cell) { return [p.box - 1 - cell[1], cell[0]]; });
    }
    return out;
  }
  var SHAPES = PIECES.map(rot4);

  var KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

  GH.Hub.register({
    id: 'tetris',
    name: '俄罗斯方块',
    icon: '🧱',
    color: '#5b8cff',
    category: 'classic',
    tags: ['经典', '反应', '益智'],
    desc: '堆叠方块填满整行，消得越多越快越难。',
    hint: '← → 移动 · ↓ 软降 · ↑ 旋转 · 空格硬降 · P 暂停',
    touch: 'dpad',
    dpad: ['left', 'right', 'down', 'up', 'space'],

    mount: function (root, api) {
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;

      var grid, cur, nextPi, bag, lines, level;
      var phase, dropAcc, lockAcc, lockResets, clearRows, clearT, held, tiles;
      var lastT = 0;                 // 上一帧时间戳（用于帧率无关的推进）
      var dasT = 0, dasDir = 0, dasStarted = false;      // 左右长按自动重复

      /* ---------------- 下一个方块预览（DOM，置于画布上方） ---------------- */
      var nextWrap = U.el('div');
      nextWrap.style.cssText = 'display:flex;align-items:center;gap:10px;';
      var nextLabel = U.el('span', null, '下一个');
      nextLabel.style.cssText = 'font-size:12px;color:#6e7b96;letter-spacing:.06em;';
      var nextGrid = U.el('div');
      nextGrid.style.cssText =
        'display:grid;grid-template-columns:repeat(4,13px);grid-template-rows:repeat(4,13px);' +
        'gap:2px;padding:6px;border-radius:10px;' +
        'background:rgba(255,255,255,.85);border:1px solid rgba(24,38,82,.10);';
      var nextCells = [];
      for (var ni = 0; ni < 16; ni++) {
        var nd = U.el('div');
        nd.style.cssText = 'border-radius:3px;';
        nextCells.push(nd);
        nextGrid.appendChild(nd);
      }
      nextWrap.appendChild(nextLabel);
      nextWrap.appendChild(nextGrid);
      root.insertBefore(nextWrap, g.canvas);

      /* ---------------- 方块贴图（离屏渐变，缓存复用） ---------------- */
      function tile(color) {
        if (tiles[color]) return tiles[color];
        var S = 3, s = CELL * S;
        var cv = document.createElement('canvas');
        cv.width = s; cv.height = s;
        var x = cv.getContext('2d');
        var m = 1.6 * S, r = 7 * S;
        // 外圈暗边
        x.fillStyle = U.shade(color, -0.3);
        U.rr(x, m, m, s - m * 2, s - m * 2, r);
        x.fill();
        // 主体渐变
        var gd = x.createLinearGradient(0, m, 0, s - m);
        gd.addColorStop(0, U.shade(color, 0.34));
        gd.addColorStop(0.52, color);
        gd.addColorStop(1, U.shade(color, -0.18));
        x.fillStyle = gd;
        U.rr(x, m + S * 0.7, m + S * 0.7, s - m * 2 - S * 1.4, s - m * 2 - S * 1.4, r * 0.82);
        x.fill();
        // 顶部高光条
        x.globalAlpha = 0.34;
        x.fillStyle = '#ffffff';
        U.rr(x, m + S * 2.2, m + S * 2.2, s - m * 2 - S * 4.4, s * 0.2, r * 0.5);
        x.fill();
        x.globalAlpha = 1;
        tiles[color] = cv;
        return cv;
      }

      /* ---------------- 基础工具 ---------------- */
      function emptyRow() {
        var row = [];
        for (var c = 0; c < COLS; c++) row.push(null);
        return row;
      }

      function bagNext() {
        if (!bag.length) {
          bag = [0, 1, 2, 3, 4, 5, 6];
          api.shuffle(bag);   // 7-bag 随机
        }
        return bag.pop();
      }

      function collide(rot, px, py) {
        var cs = SHAPES[cur.pi][rot];
        for (var i = 0; i < cs.length; i++) {
          var x = px + cs[i][0], y = py + cs[i][1];
          if (x < 0 || x >= COLS || y >= ROWS) return true;
          if (y >= 0 && grid[y][x]) return true;
        }
        return false;
      }

      function grounded() {
        return cur ? collide(cur.rot, cur.x, cur.y + 1) : false;
      }

      function baseGravityMs() { return Math.max(70, 800 - (level - 1) * 62); }
      function gravityMs() { return held.down ? 45 : baseGravityMs(); }

      function updateStatus() {
        api.setStatus('等级 ' + level + ' · 已消 ' + lines + ' 行 · 下落 ' +
          (baseGravityMs() / 1000).toFixed(1) + 's/格');
      }

      function paintNext(pi) {
        var i;
        for (i = 0; i < 16; i++) {
          nextCells[i].style.background = 'transparent';
          nextCells[i].style.boxShadow = 'none';
        }
        var cs = SHAPES[pi][0], color = PIECES[pi].c;
        var minX = 9, minY = 9;
        for (i = 0; i < cs.length; i++) {
          if (cs[i][0] < minX) minX = cs[i][0];
          if (cs[i][1] < minY) minY = cs[i][1];
        }
        for (i = 0; i < cs.length; i++) {
          var idx = (cs[i][1] - minY) * 4 + (cs[i][0] - minX);
          if (idx >= 0 && idx < 16) {
            nextCells[idx].style.background =
              'linear-gradient(180deg,' + U.shade(color, 0.34) + ',' + U.shade(color, -0.12) + ')';
            nextCells[idx].style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.35)';
          }
        }
      }

      /* ---------------- 流程 ---------------- */
      function reset() {
        grid = [];
        for (var r = 0; r < ROWS; r++) grid.push(emptyRow());
        bag = [];
        nextPi = bagNext();
        lines = 0;
        level = 1;
        phase = 'play';
        dropAcc = 0;
        lockAcc = 0;
        lockResets = 0;
        clearRows = [];
        clearT = 0;
        held = { down: false };
        dasDir = 0; dasT = 0; dasStarted = false;
        tiles = {};
        api.setScore(0);
        spawnNext();
        updateStatus();
      }

      function spawnNext() {
        var pi = nextPi;
        nextPi = bagNext();
        paintNext(nextPi);

        var def = PIECES[pi], cs = SHAPES[pi][0];
        var minX = 9, minY = 9;
        for (var i = 0; i < cs.length; i++) {
          if (cs[i][0] < minX) minX = cs[i][0];
          if (cs[i][1] < minY) minY = cs[i][1];
        }
        cur = {
          pi: pi,
          rot: 0,
          x: Math.floor((COLS - def.box) / 2) - minX,
          y: -minY
        };
        dropAcc = 0;
        lockAcc = 0;
        lockResets = 0;
        phase = 'play';
        if (collide(0, cur.x, cur.y)) { cur = null; gameOver(); }
      }

      function resetLock() {
        if (cur && grounded() && lockResets < 15) { lockResets++; lockAcc = 0; }
      }

      function move(dx) {
        if (phase !== 'play' || !cur) return;
        if (collide(cur.rot, cur.x + dx, cur.y)) { api.audio.play('tick'); return; }
        cur.x += dx;
        api.audio.play('move');
        resetLock();
      }

      function rotate() {
        if (phase !== 'play' || !cur) return;
        var nr = (cur.rot + 1) % 4;
        for (var i = 0; i < KICKS.length; i++) {
          var nx = cur.x + KICKS[i][0], ny = cur.y + KICKS[i][1];
          if (!collide(nr, nx, ny)) {
            cur.rot = nr; cur.x = nx; cur.y = ny;
            api.audio.play('flip');
            resetLock();
            return;
          }
        }
        api.audio.play('tick');
      }

      function stepDown(soft) {
        if (!cur) return false;
        if (collide(cur.rot, cur.x, cur.y + 1)) return false;
        cur.y++;
        if (soft) api.addScore(1);   // 软降 +1/格
        return true;
      }

      function hardDrop() {
        if (phase !== 'play' || !cur) return;
        var d = 0;
        while (!collide(cur.rot, cur.x, cur.y + 1)) { cur.y++; d++; }
        if (d) api.addScore(d * 2);  // 硬降 +2/格
        api.audio.play('hit');
        lockPiece();
      }

      function lockPiece() {
        if (!cur) return;
        var cs = SHAPES[cur.pi][cur.rot], color = PIECES[cur.pi].c;
        var topOut = false;
        for (var i = 0; i < cs.length; i++) {
          var x = cur.x + cs[i][0], y = cur.y + cs[i][1];
          if (y < 0) { topOut = true; continue; }
          grid[y][x] = color;
        }
        cur = null;
        dropAcc = 0;
        lockAcc = 0;
        lockResets = 0;

        var full = [];
        for (var r = 0; r < ROWS; r++) {
          var ok = true;
          for (var c = 0; c < COLS; c++) if (!grid[r][c]) { ok = false; break; }
          if (ok) full.push(r);
        }

        if (full.length) {
          lines += full.length;
          api.addScore([0, 100, 300, 500, 800][full.length]);
          var nv = Math.min(20, 1 + Math.floor(lines / 10));
          if (nv > level) { level = nv; api.audio.play('levelup'); }
          else api.audio.play(full.length >= 4 ? 'win' : 'line');
          clearRows = full;
          clearT = CLEAR_MS / 1000;
          phase = 'clearing';
          updateStatus();
        } else if (topOut) {
          gameOver();
        } else {
          api.audio.play('drop');
          spawnNext();
        }
      }

      function finishClear() {
        var keep = [];
        for (var r = 0; r < ROWS; r++) {
          if (clearRows.indexOf(r) === -1) keep.push(grid[r]);
        }
        while (keep.length < ROWS) keep.unshift(emptyRow());
        grid = keep;
        clearRows = [];
        phase = 'play';
        api.audio.play('score');
        spawnNext();
      }

      function gameOver() {
        if (phase === 'over') return;
        phase = 'over';
        api.audio.play('lose');
        api.finish({
          title: '游戏结束',
          sub: '方块堆到顶了 · 消除 ' + lines + ' 行 · 到达等级 ' + level,
          icon: '🧱',
          metrics: { tetris_lines: lines }
        });
      }

      /* ---------------- 绘制 ---------------- */
      function draw() {
        ctx.fillStyle = '#f3f6fc';
        ctx.fillRect(0, 0, W, H);

        // 网格淡线
        ctx.strokeStyle = 'rgba(24,38,82,.08)';
        ctx.lineWidth = 1;
        var c, r;
        for (c = 1; c < COLS; c++) {
          ctx.beginPath();
          ctx.moveTo(c * CELL + 0.5, 0);
          ctx.lineTo(c * CELL + 0.5, H);
          ctx.stroke();
        }
        for (r = 1; r < ROWS; r++) {
          ctx.beginPath();
          ctx.moveTo(0, r * CELL + 0.5);
          ctx.lineTo(W, r * CELL + 0.5);
          ctx.stroke();
        }

        // 已固定的方块
        for (r = 0; r < ROWS; r++) {
          for (c = 0; c < COLS; c++) {
            if (grid[r][c]) ctx.drawImage(tile(grid[r][c]), c * CELL, r * CELL, CELL, CELL);
          }
        }

        // 幽灵落点 + 当前方块
        if (cur && phase === 'play') {
          var gy = cur.y;
          while (!collide(cur.rot, cur.x, gy + 1)) gy++;
          var gcs = SHAPES[cur.pi][cur.rot], gcol = PIECES[cur.pi].c;
          ctx.globalAlpha = 0.16;
          for (var i = 0; i < gcs.length; i++) {
            var gyy = gy + gcs[i][1];
            if (gyy >= 0) ctx.drawImage(tile(gcol), (cur.x + gcs[i][0]) * CELL, gyy * CELL, CELL, CELL);
          }
          ctx.globalAlpha = 1;

          var cs = SHAPES[cur.pi][cur.rot], ccol = PIECES[cur.pi].c;
          for (var j = 0; j < cs.length; j++) {
            var cy = cur.y + cs[j][1];
            if (cy >= 0) ctx.drawImage(tile(ccol), (cur.x + cs[j][0]) * CELL, cy * CELL, CELL, CELL);
          }
        }

        // 消行闪白
        if (phase === 'clearing' && clearRows.length) {
          var k = 1 - clearT / (CLEAR_MS / 1000);
          ctx.globalAlpha = 0.15 + 0.75 * Math.sin(Math.PI * U.clamp(k, 0, 1));
          ctx.fillStyle = '#fbbf24';
          for (var m = 0; m < clearRows.length; m++) {
            ctx.fillRect(0, clearRows[m] * CELL, W, CELL);
          }
          ctx.globalAlpha = 1;
        }

        // 外框
        ctx.strokeStyle = phase === 'over' ? 'rgba(217,61,89,.55)' : 'rgba(47,107,255,.32)';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
      }

      /* ---------------- 主循环 ---------------- */
      api.loop(function () {
        // 真实时间步长：120/144Hz 屏幕不会让方块掉得更快
        var now = performance.now();
        var dtMs = lastT ? Math.min(100, Math.max(0, now - lastT)) : DT;
        lastT = now;

        if (!api.isPaused()) {
          // 左右长按自动重复：首次 170ms 后以 45ms 间隔连移
          if (dasDir) {
            dasT += dtMs;
            var gap = dasStarted ? 45 : 170;
            while (dasT >= gap) {
              dasT -= gap;
              dasStarted = true;
              move(dasDir);
            }
          }

          if (phase === 'clearing') {
            clearT -= dtMs / 1000;
            if (clearT <= 0) finishClear();
          } else if (phase === 'play') {
            dropAcc += dtMs;
            var ms = gravityMs();
            var guard = 0;
            while (dropAcc >= ms && guard < 6) {
              dropAcc -= ms;
              if (!stepDown(held.down)) { dropAcc = 0; break; }
              ms = gravityMs();
              guard++;
            }
            if (cur && grounded()) {
              lockAcc += dtMs;
              if (lockAcc >= LOCK_MS) lockPiece();
            } else {
              lockAcc = 0;
            }
          }
        }
        draw();
      });

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, p) {
        if (p === 'down') {
          if (name === 'left') { move(-1); dasDir = -1; dasT = 0; dasStarted = false; }
          else if (name === 'right') { move(1); dasDir = 1; dasT = 0; dasStarted = false; }
          else if (name === 'up') rotate();
          else if (name === 'space') hardDrop();
          else if (name === 'down') held.down = true;
        } else if (name === 'down') {
          held.down = false;
        } else if (name === 'left' || name === 'right') {
          // 松开任一方向键即停止连移
          if (dasDir === (name === 'left' ? -1 : 1)) dasDir = 0;
        }
      });

      reset();
      api.hint('填满一行即可消除：<b style="color:#b8760a">单 100 / 双 300 / 三 500 / 四 800</b>，每消 10 行升一级、下落更快。');

      return {
        destroy: function () { tiles = {}; },
        restart: reset
      };
    }
  });
})(window.GH);
