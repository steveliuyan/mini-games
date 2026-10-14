/* ===========================================================
   reversi.js — 黑白棋 / 奥赛罗（Canvas / 8×8）
   完整规则 + 自动跳过；AI = 位置权重表 + 极小极大(α-β)
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var B = 8;                 // 8×8
  var WW = 560, WH = 624;    // 世界坐标
  var OX = 20, OY = 72;      // 棋盘左上角
  var CELL = 65;
  var HUM = 1, CMP = 2;      // 1 = 玩家(黑)，2 = AI(白)
  var DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  var LEVELS = [
    { id: 1, name: '简单' },
    { id: 2, name: '普通' },
    { id: 3, name: '困难' }
  ];

  /* 经典位置权重表：角最高，角旁最低 */
  var W8 = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120]
  ];

  var level = 2;             // 难度（跨重开保留）

  function inB(x, y) { return x >= 0 && y >= 0 && x < B && y < B; }

  /* ---------------- 规则（纯函数） ---------------- */

  /* 在 (x,y) 落 c 子能翻掉的所有对方子 */
  function flipsAt(bd, x, y, c) {
    var out = [];
    if (bd[y][x]) return out;
    var opp = 3 - c;
    for (var d = 0; d < 8; d++) {
      var dx = DIRS8[d][0], dy = DIRS8[d][1];
      var nx = x + dx, ny = y + dy, run = [];
      while (inB(nx, ny) && bd[ny][nx] === opp) {
        run.push([nx, ny]);
        nx += dx; ny += dy;
      }
      if (run.length && inB(nx, ny) && bd[ny][nx] === c) {
        for (var i = 0; i < run.length; i++) out.push(run[i]);
      }
    }
    return out;
  }

  function legalMoves(bd, c) {
    var out = [];
    for (var y = 0; y < B; y++) {
      for (var x = 0; x < B; x++) {
        if (bd[y][x]) continue;
        var f = flipsAt(bd, x, y, c);
        if (f.length) out.push({ x: x, y: y, flips: f });
      }
    }
    return out;
  }

  function apply(bd, mv, c) {
    bd[mv.y][mv.x] = c;
    for (var i = 0; i < mv.flips.length; i++) bd[mv.flips[i][1]][mv.flips[i][0]] = c;
  }

  function revert(bd, mv, c) {
    bd[mv.y][mv.x] = 0;
    var opp = 3 - c;
    for (var i = 0; i < mv.flips.length; i++) bd[mv.flips[i][1]][mv.flips[i][0]] = opp;
  }

  function countOf(bd, c) {
    var n = 0;
    for (var y = 0; y < B; y++) for (var x = 0; x < B; x++) if (bd[y][x] === c) n++;
    return n;
  }

  function emptiesOf(bd) {
    var n = 0;
    for (var y = 0; y < B; y++) for (var x = 0; x < B; x++) if (!bd[y][x]) n++;
    return n;
  }

  /* 静态评估：位置权重差 + 残局子数差（AI 视角） */
  function evaluate(bd) {
    var mine = 0, his = 0, mv = 0, ov = 0, y, x, v;
    for (y = 0; y < B; y++) {
      for (x = 0; x < B; x++) {
        v = bd[y][x];
        if (v === CMP) { mine += W8[y][x]; mv++; }
        else if (v === HUM) { his += W8[y][x]; ov++; }
      }
    }
    var s = mine - his * 1.05;
    if (mv + ov >= 52) s += (mv - ov) * 9;   // 残局更看重子数
    return s;
  }

  function finalScore(bd) {
    var d = countOf(bd, CMP) - countOf(bd, HUM);
    if (d > 0) return 100000 + d;
    if (d < 0) return -100000 + d;
    return 0;
  }

  /* 极小极大 + α-β；返回值始终以 AI 视角 */
  function search(bd, c, depth, alpha, beta) {
    var moves = legalMoves(bd, c);
    if (!moves.length) {
      if (!legalMoves(bd, 3 - c).length) return finalScore(bd);
      return search(bd, 3 - c, depth - 1, alpha, beta);   // 对方也没得下 → 直接跳过
    }
    if (depth <= 0) return evaluate(bd);

    var i, m, v;
    if (c === CMP) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        m = moves[i];
        apply(bd, m, CMP);
        v = search(bd, HUM, depth - 1, alpha, beta);
        revert(bd, m, CMP);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    var bw = Infinity;
    for (i = 0; i < moves.length; i++) {
      m = moves[i];
      apply(bd, m, HUM);
      v = search(bd, CMP, depth - 1, alpha, beta);
      revert(bd, m, HUM);
      if (v < bw) bw = v;
      if (bw < beta) beta = bw;
      if (alpha >= beta) break;
    }
    return bw;
  }

  /* ---------------- 注册 ---------------- */
  GH.Hub.register({
    id: 'reversi',
    name: '黑白棋',
    icon: '⚪',
    color: '#34d399',
    category: 'versus',
    tags: ['棋类', '策略', 'AI 对战'],
    desc: '夹住对方棋子翻面，终局子多者胜。',
    hint: '点击绿点落子，无子可下会自动跳过',
    touch: 'tap',

    mount: function (root, api) {
      var g = api.canvas({ w: WW, h: WH });
      var ctx = g.ctx;

      var bd, turn, over, anims, last, thinking, aiTimer, t, bgGrd, boardGrd, lastT;

      function newBoard() {
        var b = [], y, x, row;
        for (y = 0; y < B; y++) {
          row = [];
          for (x = 0; x < B; x++) row.push(0);
          b.push(row);
        }
        // 标准开局：黑 d5 / e4，白 d4 / e5
        b[3][3] = CMP; b[4][3] = HUM;
        b[3][4] = HUM; b[4][4] = CMP;
        return b;
      }

      function reset() {
        bd = newBoard();
        turn = HUM;
        over = false;
        anims = {};
        last = null;
        thinking = false;
        t = 0;
        lastT = 0;
        api.setScore(0);
        advance();
      }

      /* ---------------- 对局流程 ---------------- */
      function statusText() {
        var hp = countOf(bd, HUM), ap = countOf(bd, CMP);
        var s = '你(黑) ' + hp + ' · AI(白) ' + ap;
        if (over) return s;
        return s + ' · ' + (turn === HUM ? '轮到你落子' : 'AI 思考中…');
      }

      function doMove(mv, c) {
        var opp = 3 - c, i;
        anims[mv.y * B + mv.x] = { t: 0, from: 0, to: c };
        for (i = 0; i < mv.flips.length; i++) {
          anims[mv.flips[i][1] * B + mv.flips[i][0]] = { t: 0, from: opp, to: c };
        }
        apply(bd, mv, c);
        last = { x: mv.x, y: mv.y, c: c };
        api.audio.play(c === HUM ? 'flip' : 'drop');
      }

      /* 结算回合：自动跳过无子可下的一方，双方都无子时结束 */
      function advance() {
        var guard = 0;
        while (!over && guard++ < 4) {
          var pHas = legalMoves(bd, HUM).length > 0;
          var cHas = legalMoves(bd, CMP).length > 0;
          if (!pHas && !cHas) { endGame(); return; }
          if (turn === HUM && !pHas) {
            api.toast('你无子可下，自动跳过', { type: 'warn', icon: '⏭️' });
            api.audio.play('tick');
            turn = CMP;
            continue;
          }
          if (turn === CMP && !cHas) {
            api.toast('AI 无子可下，跳过', { icon: '⏭️' });
            api.audio.play('tick');
            turn = HUM;
            continue;
          }
          break;
        }
        if (over) return;
        api.setStatus(statusText());
        if (turn === CMP) scheduleAI();
      }

      function scheduleAI() {
        if (over || turn !== CMP) return;
        thinking = true;
        aiTimer = api.timeout(function () {
          if (over) { thinking = false; return; }
          thinking = false;
          var mv = aiPick();
          if (!mv) { endGame(); return; }
          doMove(mv, CMP);
          turn = HUM;
          advance();
        }, api.randInt(300, 500));
      }

      function endGame() {
        over = true;
        thinking = false;
        var hp = countOf(bd, HUM), ap = countOf(bd, CMP);
        var diff = hp - ap;
        var score = 0, title, sub, icon;
        if (diff > 0) {
          score = 1000 + diff * 20;
          title = '你赢了！';
          sub = '终局 ' + hp + ' : ' + ap + '，净胜 ' + diff + ' 子';
          icon = '🏆';
          api.audio.play('win');
        } else if (diff < 0) {
          title = 'AI 获胜';
          sub = '终局 ' + hp + ' : ' + ap + '，落后 ' + (-diff) + ' 子';
          icon = '🤖';
          api.audio.play('lose');
        } else {
          score = 200;
          title = '平局';
          sub = '终局 ' + hp + ' : ' + ap + '，势均力敌';
          icon = '🤝';
          api.audio.play('tick');
        }
        api.setScore(score);
        api.setStatus(statusText());
        api.finish({
          win: diff > 0,
          title: title,
          sub: sub,
          icon: icon,
          metrics: { reversi_wins: diff > 0 ? 1 : 0 }
        });
      }

      /* ---------------- AI ---------------- */
      function aiPick() {
        var moves = legalMoves(bd, CMP);
        if (!moves.length) return null;
        moves = api.shuffle(moves.slice());

        if (level === 1) return api.choice(moves);

        if (level === 2) {
          // 普通：贪心一层 —— 权重表 + 翻子数 + 随机扰动
          var best = moves[0], bs = -Infinity;
          for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            apply(bd, m, CMP);
            var s = evaluate(bd) + m.flips.length * 2.5 + api.randFloat(0, 0.8);
            revert(bd, m, CMP);
            if (s > bs) { bs = s; best = m; }
          }
          return best;
        }

        // 困难：4 层（残局 6 层）极小极大 + α-β
        var deep = emptiesOf(bd) <= 12 ? 6 : 4;
        var pickBest = moves[0], bestV = -Infinity, alpha = -Infinity;
        for (var k = 0; k < moves.length; k++) {
          var mv = moves[k];
          apply(bd, mv, CMP);
          var v = search(bd, HUM, deep - 1, alpha, Infinity);
          revert(bd, mv, CMP);
          if (v > bestV) { bestV = v; pickBest = mv; }
          if (bestV > alpha) alpha = bestV;
        }
        return pickBest;
      }

      /* ---------------- 绘制 ---------------- */
      function toWorld(cx, cy) {
        var r = g.canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return {
          x: (cx - r.left) / r.width * WW,
          y: (cy - r.top) / r.height * WH
        };
      }

      function drawDisc(cx, cy, r, c, sx) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sx, 1);
        ctx.shadowColor = 'rgba(24,38,82,.28)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 3;
        var grd = ctx.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.1, 0, 0, r * 1.05);
        if (c === HUM) {
          grd.addColorStop(0, '#5f6a7d');
          grd.addColorStop(0.55, '#242b3a');
          grd.addColorStop(1, '#070a11');
        } else {
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.62, '#e8eefb');
          grd.addColorStop(1, '#adb9d0');
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function drawHeader() {
        var hp = countOf(bd, HUM), ap = countOf(bd, CMP);
        var pulse = 0.55 + Math.sin(t * 5) * 0.45;

        drawDisc(100, 36, 13, HUM, 1);
        U.label(ctx, '你 ' + hp, 122, 37, { font: 'bold 19px ' + U.FONT, fill: '#131c33', align: 'left' });

        drawDisc(460, 36, 13, CMP, 1);
        U.label(ctx, 'AI ' + ap, 438, 37, { font: 'bold 19px ' + U.FONT, fill: '#131c33', align: 'right' });

        var txt = over ? '对局结束' : (turn === HUM ? '轮到你落子' : 'AI 思考中…');
        ctx.fillStyle = 'rgba(24,38,82,.07)';
        U.rr(ctx, 196, 20, 168, 32, 16);
        ctx.fill();
        if (!over) {
          ctx.strokeStyle = turn === HUM ? 'rgba(13,148,102,' + pulse + ')' : 'rgba(109,77,224,' + pulse + ')';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        U.label(ctx, txt, 280, 37, {
          font: 'bold 15px ' + U.FONT,
          fill: turn === HUM && !over ? '#0d9466' : '#47536e'
        });
      }

      function draw() {
        if (!bgGrd) {
          bgGrd = ctx.createLinearGradient(0, 0, WW, WH);
          bgGrd.addColorStop(0, '#eef2fa');
          bgGrd.addColorStop(1, '#e3eaf6');
          boardGrd = ctx.createLinearGradient(OX, OY, OX + CELL * B, OY + CELL * B);
          boardGrd.addColorStop(0, '#3f9a6c');
          boardGrd.addColorStop(1, '#246b4a');
        }
        ctx.fillStyle = bgGrd;
        ctx.fillRect(0, 0, WW, WH);

        drawHeader();

        // 棋盘
        var sz = CELL * B;
        ctx.save();
        ctx.shadowColor = 'rgba(24,38,82,.30)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = boardGrd;
        U.rr(ctx, OX - 6, OY - 6, sz + 12, sz + 12, 12);
        ctx.fill();
        ctx.restore();

        // 网格
        ctx.strokeStyle = 'rgba(0,40,20,.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i <= B; i++) {
          ctx.moveTo(OX + i * CELL, OY);
          ctx.lineTo(OX + i * CELL, OY + sz);
          ctx.moveTo(OX, OY + i * CELL);
          ctx.lineTo(OX + sz, OY + i * CELL);
        }
        ctx.stroke();

        // 合法落点提示
        if (!over && turn === HUM && !thinking) {
          var ms = legalMoves(bd, HUM);
          var a = 0.20 + Math.sin(t * 4) * 0.10;
          for (var k = 0; k < ms.length; k++) {
            ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
            ctx.beginPath();
            ctx.arc(OX + ms[k].x * CELL + CELL / 2, OY + ms[k].y * CELL + CELL / 2, CELL * 0.16, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 棋子（含翻面动画）—— 动画进度由主循环按真实时间推进
        var keys = Object.keys(anims), n;
        for (var y = 0; y < B; y++) {
          for (var x = 0; x < B; x++) {
            var v = bd[y][x];
            if (!v) continue;
            var cx = OX + x * CELL + CELL / 2;
            var cy = OY + y * CELL + CELL / 2;
            var rr = CELL * 0.42;
            var an = anims[y * B + x];
            if (an) {
              var kk = Math.min(an.t, 1);
              if (an.from === 0) {
                drawDisc(cx, cy, rr, an.to, Math.sin(kk * Math.PI * 0.5));
              } else {
                drawDisc(cx, cy, rr, kk < 0.5 ? an.from : an.to, Math.abs(Math.cos(kk * Math.PI)));
              }
            } else {
              drawDisc(cx, cy, rr, v, 1);
            }
          }
        }

        // 最后一手标记
        if (last) {
          ctx.strokeStyle = last.c === HUM ? 'rgba(13,148,102,.95)' : 'rgba(109,77,224,.95)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(OX + last.x * CELL + CELL / 2, OY + last.y * CELL + CELL / 2, CELL * 0.44, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      /* ---------------- 主循环 ---------------- */
      api.loop(function () {
        // 翻转动画与呼吸光效按真实时间推进，不受屏幕刷新率影响
        var now = performance.now();
        var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
        lastT = now;
        t += dt;
        if (anims) {
          var keys = Object.keys(anims);
          for (var n = 0; n < keys.length; n++) {
            anims[keys[n]].t += dt / 0.24;
            if (anims[keys[n]].t >= 1) delete anims[keys[n]];
          }
        }
        draw();
      });

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (name !== 'tap' || phase !== 'down') return;
        if (over || thinking || turn !== HUM) return;
        var w = toWorld(e.x, e.y);
        if (!w) return;
        var cx = Math.floor((w.x - OX) / CELL);
        var cy = Math.floor((w.y - OY) / CELL);
        if (!inB(cx, cy)) return;
        var ms = legalMoves(bd, HUM), mv = null;
        for (var i = 0; i < ms.length; i++) {
          if (ms[i].x === cx && ms[i].y === cy) { mv = ms[i]; break; }
        }
        if (!mv) { api.audio.play('wrong'); return; }
        doMove(mv, HUM);
        turn = CMP;
        advance();
      });

      /* ---------------- 控件 ---------------- */
      var bar = api.ctrlBar();
      var chips = [];
      LEVELS.forEach(function (lv) {
        var b = U.el('button', 'chip' + (lv.id === level ? ' is-active' : ''), lv.name);
        b.type = 'button';
        b.addEventListener('click', function () {
          level = lv.id;
          chips.forEach(function (o) { o.el.classList.toggle('is-active', o.id === level); });
          api.audio.play('select');
          api.toast('难度：' + lv.name, { icon: '🎚️' });
        });
        chips.push({ id: lv.id, el: b });
        bar.appendChild(b);
      });

      var again = U.el('button', 'chip', '重开');
      again.type = 'button';
      again.addEventListener('click', function () {
        api.audio.play('click');
        reset();
      });
      bar.appendChild(again);

      reset();
      api.hint('在能夹住对方棋子的位置落子（绿点提示），被夹住的棋子全部翻面。谁无子可下就自动跳过，<b style="color:#0d9466">终局子多者获胜</b>。');

      return {
        destroy: function () { if (aiTimer) api.clearTimeout(aiTimer); },
        restart: reset
      };
    }
  });
})(window.GH);
