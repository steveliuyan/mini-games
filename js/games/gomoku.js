/* ===========================================================
   gomoku.js — 五子棋（Canvas / 15×15）
   玩家执黑先手；AI = 棋型评分 + 候选点裁剪 + 极小极大(α-β)
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var N = 15;                              // 棋盘路数
  var WORLD = 560;                         // 世界坐标边长
  var PAD = 30;                            // 四周边距
  var CELL = (WORLD - PAD * 2) / (N - 1);  // 格距（世界坐标）
  var E = 0, HUM = 1, CMP = 2;             // 空 / 玩家(黑) / AI(白)
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  var SEG = [0, 1, 12, 120, 2000, 1000000]; // 五连窗口内我方子数 → 分值
  var STARS = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
  var LEVELS = [
    { id: 1, name: '简单' },
    { id: 2, name: '普通' },
    { id: 3, name: '困难' }
  ];

  /* 复用的临时缓冲，减少落叶节点的 GC 压力 */
  var maskBuf = new Array(N * N);
  var lineBuf = [];

  /* ---------------- 纯棋盘算法（不碰 DOM / api） ---------------- */

  function inB(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

  /* 一行里所有长度为 5、且不含对方子/墙的窗口累加得分 */
  function scoreLine(cells) {
    var total = 0, n = cells.length;
    for (var i = 0; i + 5 <= n; i++) {
      var cnt = 0, blocked = false;
      for (var j = 0; j < 5; j++) {
        var v = cells[i + j];
        if (v === 2) { blocked = true; break; }
        if (v === 1) cnt++;
      }
      if (!blocked) total += SEG[cnt];
    }
    return total;
  }

  /* 评估「在 (x,y) 落 color 子」这一点的价值（4 个方向各取 9 格窗口） */
  function pointScore(bd, x, y, color) {
    var total = 0;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      lineBuf.length = 0;
      for (var k = -4; k <= 4; k++) {
        if (k === 0) { lineBuf.push(1); continue; }
        var nx = x + dx * k, ny = y + dy * k;
        if (!inB(nx, ny)) { lineBuf.push(2); continue; }
        var v = bd[ny][nx];
        lineBuf.push(v === 0 ? 0 : (v === color ? 1 : 2));
      }
      total += scoreLine(lineBuf);
    }
    return total;
  }

  function winsAt(bd, x, y, c) {
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1], n = 1;
      for (var s = 1; s <= 4; s++) {
        var nx = x + dx * s, ny = y + dy * s;
        if (!inB(nx, ny) || bd[ny][nx] !== c) break;
        n++;
      }
      for (var s2 = 1; s2 <= 4; s2++) {
        var px = x - dx * s2, py = y - dy * s2;
        if (!inB(px, py) || bd[py][px] !== c) break;
        n++;
      }
      if (n >= 5) return true;
    }
    return false;
  }

  /* 取连成的一串坐标（用于胜利高亮） */
  function winRun(bd, x, y, c) {
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var cells = [[x, y]], s, nx, ny;
      for (s = 1; s <= 4; s++) {
        nx = x + dx * s; ny = y + dy * s;
        if (!inB(nx, ny) || bd[ny][nx] !== c) break;
        cells.push([nx, ny]);
      }
      for (s = 1; s <= 4; s++) {
        nx = x - dx * s; ny = y - dy * s;
        if (!inB(nx, ny) || bd[ny][nx] !== c) break;
        cells.unshift([nx, ny]);
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  function scanLine(bd, c, x0, y0, dx, dy, len) {
    var has = false, i, v;
    lineBuf.length = 0;
    for (i = 0; i < len; i++) {
      v = bd[y0 + dy * i][x0 + dx * i];
      if (v) has = true;
      lineBuf.push(v === 0 ? 0 : (v === c ? 1 : 2));
    }
    return has ? scoreLine(lineBuf) : 0;
  }

  /* 全局静态评估：某方所有线的棋型分之和 */
  function boardScore(bd, c) {
    var s = 0, i;
    for (i = 0; i < N; i++) {
      s += scanLine(bd, c, 0, i, 1, 0, N);          // 行
      s += scanLine(bd, c, i, 0, 0, 1, N);          // 列
    }
    for (i = 0; i < N; i++) {                        // ↘
      s += scanLine(bd, c, 0, i, 1, 1, N - i);
      if (i > 0) s += scanLine(bd, c, i, 0, 1, 1, N - i);
    }
    for (i = 0; i < N; i++) {                        // ↙
      s += scanLine(bd, c, i, 0, -1, 1, i + 1);
      if (i > 0) s += scanLine(bd, c, N - 1, i, -1, 1, N - i);
    }
    return s;
  }

  function evalBoard(bd) {
    return boardScore(bd, CMP) - boardScore(bd, HUM) * 1.2;
  }

  /* 候选点裁剪：只保留已有棋子周围 2 格内的空点，按启发式排序 */
  function candidates(bd, limit) {
    var i, x, y, dx, dy, nx, ny, any = false;
    for (i = 0; i < N * N; i++) maskBuf[i] = 0;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        if (!bd[y][x]) continue;
        any = true;
        for (dy = -2; dy <= 2; dy++) {
          for (dx = -2; dx <= 2; dx++) {
            nx = x + dx; ny = y + dy;
            if (inB(nx, ny)) maskBuf[ny * N + nx] = 1;
          }
        }
      }
    }
    if (!any) return [{ x: 7, y: 7 }];
    var list = [];
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        if (bd[y][x] || !maskBuf[y * N + x]) continue;
        list.push({
          x: x, y: y,
          s: pointScore(bd, x, y, CMP) + pointScore(bd, x, y, HUM) * 0.9
        });
      }
    }
    list.sort(function (a, b) { return b.s - a.s; });
    if (limit && list.length > limit) list = list.slice(0, limit);
    return list;
  }

  /* 极小极大 + α-β，返回值以 AI 视角 */
  function search(bd, depth, alpha, beta, isMax, cap) {
    if (depth <= 0) return evalBoard(bd);
    var cands = candidates(bd, cap);
    if (!cands.length) return evalBoard(bd);
    var i, m, v;
    if (isMax) {
      var best = -Infinity;
      for (i = 0; i < cands.length; i++) {
        m = cands[i];
        bd[m.y][m.x] = CMP;
        v = winsAt(bd, m.x, m.y, CMP) ? (9e6 + depth * 1000)
                                     : search(bd, depth - 1, alpha, beta, false, cap);
        bd[m.y][m.x] = E;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    var bw = Infinity;
    for (i = 0; i < cands.length; i++) {
      m = cands[i];
      bd[m.y][m.x] = HUM;
      v = winsAt(bd, m.x, m.y, HUM) ? -(9e6 + depth * 1000)
                                   : search(bd, depth - 1, alpha, beta, true, cap);
      bd[m.y][m.x] = E;
      if (v < bw) bw = v;
      if (bw < beta) beta = bw;
      if (alpha >= beta) break;
    }
    return bw;
  }

  /* ---------------- 注册 ---------------- */
  GH.Hub.register({
    id: 'gomoku',
    name: '五子棋',
    icon: '⚫',
    color: '#4f6bd8',
    category: 'versus',
    tags: ['棋类', '策略', 'AI 对战'],
    desc: '先连成五子者获胜，攻守兼备挑战 AI。',
    hint: '点击交叉点落子，你执黑先手',
    touch: 'tap',

    mount: function (root, api) {
      var g = api.canvas({ w: WORLD, h: WORLD });
      var ctx = g.ctx;

      var bd, turn, over, history, anims, hover, thinking, aiTimer, winCells, t, bgGrd, lastT;

      function newBoard() {
        var b = [], y, x, row;
        for (y = 0; y < N; y++) {
          row = [];
          for (x = 0; x < N; x++) row.push(0);
          b.push(row);
        }
        return b;
      }

      function reset() {
        bd = newBoard();
        turn = HUM;
        over = false;
        history = [];
        anims = {};
        hover = null;
        thinking = false;
        winCells = null;
        t = 0;
        lastT = 0;
        api.setScore(0);
        api.setStatus('轮到你落子（黑）');
      }

      /* ---------------- 坐标换算 ---------------- */
      function toWorld(cx, cy) {
        var r = g.canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return {
          x: (cx - r.left) / r.width * WORLD,
          y: (cy - r.top) / r.height * WORLD
        };
      }

      function pick(wx, wy) {
        var i = Math.round((wx - PAD) / CELL);
        var j = Math.round((wy - PAD) / CELL);
        if (i < 0 || j < 0 || i >= N || j >= N) return null;
        if (U.dist(wx, wy, PAD + i * CELL, PAD + j * CELL) > CELL * 0.62) return null;
        return { x: i, y: j };
      }

      /* ---------------- 对局流程 ---------------- */
      function place(x, y, c) {
        bd[y][x] = c;
        history.push({ x: x, y: y, c: c });
        anims[y * N + x] = 0;
        api.audio.play(c === HUM ? 'move' : 'tick');

        if (winsAt(bd, x, y, c)) { endGame(c, x, y); return; }
        if (history.length >= N * N) { endGame(0, x, y); return; }
        turn = c === HUM ? CMP : HUM;
        updateStatus();
        if (turn === CMP) scheduleAI();
      }

      function scheduleAI() {
        if (over || turn !== CMP) return;
        thinking = true;
        api.setStatus('AI 思考中…');
        aiTimer = api.timeout(function () {
          if (over) { thinking = false; return; }
          thinking = false;
          var mv = aiPick();
          if (!mv) { endGame(0, -1, -1); return; }
          place(mv.x, mv.y, CMP);
        }, api.randInt(260, 470));
      }

      function updateStatus() {
        if (over) return;
        var a = 0, b = 0, y, x;
        for (y = 0; y < N; y++) {
          for (x = 0; x < N; x++) {
            if (bd[y][x] === HUM) a++;
            else if (bd[y][x] === CMP) b++;
          }
        }
        api.setStatus((turn === HUM ? '轮到你落子（黑）' : 'AI 回合') +
          ' · 你 ' + a + ' 子 / AI ' + b + ' 子');
      }

      function endGame(winner, lx, ly) {
        over = true;
        thinking = false;
        winCells = winner ? winRun(bd, lx, ly, winner) : null;
        var steps = history.length;
        var score = 0, title, sub, icon;
        if (winner === HUM) {
          score = Math.max(1, 1000 - steps * 10);
          title = '你赢了！';
          sub = '五子连珠，共 ' + steps + ' 手';
          icon = '🏆';
          api.audio.play('win');
        } else if (winner === CMP) {
          title = 'AI 获胜';
          sub = 'AI 抢先连成五子，再试一次吧';
          icon = '🤖';
          api.audio.play('lose');
        } else {
          score = 200;
          title = '平局';
          sub = '棋盘下满了，谁也没连成五子';
          icon = '🤝';
          api.audio.play('tick');
        }
        api.setScore(score);
        // 先播胜利连线高亮 ~1 秒，再弹结算框
        api.timeout(function () {
          api.finish({
            win: winner === HUM,
            title: title,
            sub: sub,
            icon: icon,
            metrics: { gomoku_wins: winner === HUM ? 1 : 0 }
          });
        }, 1000);
      }

      function undo() {
        if (over || thinking || turn !== HUM || history.length < 2) {
          api.audio.play('wrong');
          return;
        }
        var gotAI = false, gotHUM = false, m;
        while (history.length && !(gotAI && gotHUM)) {
          m = history[history.length - 1];
          if (m.c === CMP && !gotAI) { gotAI = true; }
          else if (m.c === HUM && !gotHUM) { gotHUM = true; }
          else break;
          bd[m.y][m.x] = E;
          delete anims[m.y * N + m.x];
          history.pop();
        }
        api.audio.play('select');
        updateStatus();
      }

      /* ---------------- AI ---------------- */
      function testWin(bdg, x, y, c) {
        bdg[y][x] = c;
        var ok = winsAt(bdg, x, y, c);
        bdg[y][x] = E;
        return ok;
      }

      function aiPick() {
        if (!history.length) return { x: 7, y: 7 };
        var cands = candidates(bd, level >= 3 ? 12 : 10);
        if (!cands.length) return null;
        var i;

        for (i = 0; i < cands.length; i++) {          // 自己能连五，直接赢
          if (testWin(bd, cands[i].x, cands[i].y, CMP)) return cands[i];
        }
        if (level >= 2) {                             // 挡住对方连五
          for (i = 0; i < cands.length; i++) {
            if (testWin(bd, cands[i].x, cands[i].y, HUM)) return cands[i];
          }
        }

        if (level === 1) {                            // 简单：纯随机落子，不封堵（只收自己的五连）
          return api.choice(candidates(bd, 0));
        }
        if (level === 2) {                            // 普通：一层启发式（攻守加权）
          var best = cands[0], bs = -Infinity;
          for (i = 0; i < cands.length; i++) {
            var s = pointScore(bd, cands[i].x, cands[i].y, CMP) +
                    pointScore(bd, cands[i].x, cands[i].y, HUM) * 0.95 +
                    api.randFloat(0, 1);
            if (s > bs) { bs = s; best = cands[i]; }
          }
          return best;
        }
        /* 困难：4 层极小极大 + α-β */
        var deep = level >= 3 ? 4 : 2;
        var pickBest = cands[0], bestV = -Infinity, alpha = -Infinity;
        for (i = 0; i < cands.length; i++) {
          var m = cands[i];
          bd[m.y][m.x] = CMP;
          var v = winsAt(bd, m.x, m.y, CMP)
            ? 1e7
            : search(bd, deep - 1, alpha, Infinity, false, 6);
          bd[m.y][m.x] = E;
          if (v > bestV) { bestV = v; pickBest = m; }
          if (bestV > alpha) alpha = bestV;
        }
        return pickBest;
      }

      /* ---------------- 绘制 ---------------- */
      function drawStone(x, y, c, sc) {
        var cx = PAD + x * CELL, cy = PAD + y * CELL, r = CELL * 0.43 * sc;
        if (r <= 0.4) return;
        ctx.save();
        ctx.shadowColor = 'rgba(24,38,82,.30)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2.5;
        var grd = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.4, r * 0.12, cx, cy, r * 1.05);
        if (c === HUM) {
          grd.addColorStop(0, '#5d6779');
          grd.addColorStop(0.55, '#232a39');
          grd.addColorStop(1, '#080b12');
        } else {
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.6, '#e6ecfb');
          grd.addColorStop(1, '#aab6cd');
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function draw(dt) {
        if (!bgGrd) {
          bgGrd = ctx.createLinearGradient(0, 0, WORLD, WORLD);
          bgGrd.addColorStop(0, '#f7f1e4');
          bgGrd.addColorStop(0.55, '#f3ead7');
          bgGrd.addColorStop(1, '#eee2ca');
        }
        ctx.fillStyle = bgGrd;
        ctx.fillRect(0, 0, WORLD, WORLD);

        // 纹理（固定纹理，不闪烁）
        ctx.strokeStyle = 'rgba(120,90,40,.055)';
        ctx.lineWidth = 1;
        for (var k = 0; k < 30; k++) {
          var yy = (k * 41) % WORLD + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(WORLD, yy);
          ctx.stroke();
        }

        // 棋盘面板
        var x0 = PAD - CELL * 0.68;
        var size = CELL * (N - 1) + CELL * 1.36;
        ctx.fillStyle = 'rgba(24,38,82,.022)';
        U.rr(ctx, x0, x0, size, size, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,40,.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 网格
        var from = PAD, to = PAD + CELL * (N - 1);
        ctx.strokeStyle = 'rgba(70,52,24,.38)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 0; i < N; i++) {
          var p = PAD + i * CELL;
          ctx.moveTo(from, p); ctx.lineTo(to, p);
          ctx.moveTo(p, from); ctx.lineTo(p, to);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(70,52,24,.62)';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(from, from, to - from, to - from);

        // 星位
        ctx.fillStyle = 'rgba(70,52,24,.62)';
        for (var s = 0; s < STARS.length; s++) {
          ctx.beginPath();
          ctx.arc(PAD + STARS[s][0] * CELL, PAD + STARS[s][1] * CELL, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // 悬停预览（鼠标）
        if (hover && !over && turn === HUM && !thinking && bd[hover.y][hover.x] === E) {
          ctx.globalAlpha = 0.32;
          drawStone(hover.x, hover.y, HUM, 1);
          ctx.globalAlpha = 1;
        }

        // 棋子
        var keys = Object.keys(anims), n;
        for (n = 0; n < keys.length; n++) {
          anims[keys[n]] += dt / 0.12;
          if (anims[keys[n]] >= 1) delete anims[keys[n]];
        }
        for (var y = 0; y < N; y++) {
          for (var x = 0; x < N; x++) {
            if (!bd[y][x]) continue;
            var a = anims[y * N + x];
            var sc = a == null ? 1 : 0.6 + 0.4 * (1 - Math.pow(1 - Math.min(a, 1), 3));
            drawStone(x, y, bd[y][x], sc);
          }
        }

        // 最后一手标记
        if (history.length && !over) {
          var lm = history[history.length - 1];
          ctx.strokeStyle = lm.c === HUM ? 'rgba(255,255,255,.9)' : 'rgba(13,148,102,.95)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(PAD + lm.x * CELL, PAD + lm.y * CELL, CELL * 0.44, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 胜利连线
        if (winCells) {
          var a2 = winCells[0], b2 = winCells[winCells.length - 1];
          var pulse = 0.75 + Math.sin(t * 6) * 0.25;
          ctx.save();
          ctx.strokeStyle = 'rgba(184,118,10,' + pulse + ')';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(184,118,10,.75)';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(PAD + a2[0] * CELL, PAD + a2[1] * CELL);
          ctx.lineTo(PAD + b2[0] * CELL, PAD + b2[1] * CELL);
          ctx.stroke();
          ctx.restore();
        }
      }

      /* ---------------- 主循环 ---------------- */
      api.loop(function () {
        // 动画计时用真实时间，120/144Hz 屏幕上高亮呼吸不会变快
        var now = performance.now();
        var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
        lastT = now;
        t += dt;
        draw(dt);
      });

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name !== 'tap') return;
        if (over || thinking || turn !== HUM) return;
        var w = toWorld(e.x, e.y);
        if (!w) return;
        var c = pick(w.x, w.y);
        if (!c) return;
        hover = null;
        if (bd[c.y][c.x] !== E) { api.audio.play('wrong'); return; }
        place(c.x, c.y, HUM);
      });

      api.on(g.canvas, 'pointermove', function (e) {
        if (over || turn !== HUM) { hover = null; return; }
        var w = toWorld(e.clientX, e.clientY);
        hover = w ? pick(w.x, w.y) : null;
      });
      api.on(g.canvas, 'pointerleave', function () { hover = null; });

      /* ---------------- 控件 ---------------- */
      var lvBar = api.levelBar({
        levels: LEVELS,
        label: '难度',
        dflt: 1,
        onPick: function (idx, lv) {
          level = lv.id;
        }
      });
      var level = lvBar.lv().id;

      var bar = api.ctrlBar();
      var undoBtn = U.el('button', 'chip', '悔棋');
      undoBtn.type = 'button';
      undoBtn.addEventListener('click', undo);
      bar.appendChild(undoBtn);

      var again = U.el('button', 'chip', '重开');
      again.type = 'button';
      again.addEventListener('click', function () {
        api.audio.play('click');
        reset();
        api.toast('已重开', { icon: '🔄' });
      });
      bar.appendChild(again);

      reset();
      api.hint('连成五子（横 / 竖 / 斜）即获胜。点击交叉点落子，可用「悔棋」撤掉自己与 AI 各一步。');

      return {
        destroy: function () { if (aiTimer) api.clearTimeout(aiTimer); },
        restart: reset
      };
    }
  });
})(window.GH);
