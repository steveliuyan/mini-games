/* ===========================================================
   tictactoe.js — 井字棋（DOM / 3×3）
   难度：简单=随机，普通=随机+30% 最优，困难=完美 α-β Minimax
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  var GLYPH = { 1: '❌', 2: '⭕' };
  var HUM = 1, CMP = 2;
  var LEVELS = [
    { id: 1, name: '简单' },
    { id: 2, name: '普通' },
    { id: 3, name: '困难' }
  ];

  var streak = 0;     // 连胜次数（跨重开保留）

  /* ---------------- 纯算法 ---------------- */

  function winnerOf(b) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return b[L[0]];
    }
    return 0;
  }

  function winLineOf(b) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return L;
    }
    return null;
  }

  function isFull(b) {
    for (var i = 0; i < 9; i++) if (!b[i]) return false;
    return true;
  }

  /* 带 α-β 的 Minimax，分值以 AI 视角；depth 越大越快获胜 */
  function mm(b, depth, player, alpha, beta) {
    var w = winnerOf(b);
    if (w === CMP) return 10 - depth;
    if (w === HUM) return depth - 10;
    if (isFull(b)) return 0;

    var i, v;
    if (player === CMP) {
      var best = -Infinity;
      for (i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = CMP;
        v = mm(b, depth + 1, HUM, alpha, beta);
        b[i] = 0;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    var bw = Infinity;
    for (i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = HUM;
      v = mm(b, depth + 1, CMP, alpha, beta);
      b[i] = 0;
      if (v < bw) bw = v;
      if (bw < beta) beta = bw;
      if (alpha >= beta) break;
    }
    return bw;
  }

  function bestMove(b) {
    var best = -Infinity, bm = -1;
    for (var i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = CMP;
      var v = mm(b, 1, HUM, -Infinity, Infinity);
      b[i] = 0;
      if (v > best) { best = v; bm = i; }
    }
    return bm;
  }

  /* ---------------- 注册 ---------------- */
  GH.Hub.register({
    id: 'tictactoe',
    name: '井字棋',
    icon: '❌',
    color: '#22d3ee',
    category: 'versus',
    tags: ['棋类', '速战', 'AI 对战'],
    desc: '三子连线即胜，挑战不可战胜的 AI。',
    hint: '点击格子落子，也可按数字键 1~9',
    touch: 'tap',

    mount: function (root, api) {
      var bd, turn, over, thinking, moveCount, cellEls, aiTimer, ro = null;

      /* ---------------- DOM ---------------- */
      var board = U.el('div', 'board');
      board.style.gridTemplateColumns = 'repeat(3, var(--cell))';
      board.style.setProperty('--cell', '86px');
      root.appendChild(board);

      var status = U.el('div', 'stage-status');
      root.appendChild(status);

      var hint = U.el('div', 'stage-hint',
        '你先手执 <b style="color:#22d3ee">❌</b>，横竖斜连成三子即获胜；「困难」档的 AI 不会犯错。');
      root.appendChild(hint);

      cellEls = [];
      for (var i = 0; i < 9; i++) {
        var c = U.el('button', 'cell');
        c.type = 'button';
        c.style.cursor = 'pointer';
        board.appendChild(c);
        cellEls.push(c);
        (function (idx, node) {
          node.addEventListener('click', function () { tapCell(idx); });
        })(i, c);
      }

      function fit() {
        var avail = root.clientWidth - 40;
        var cell = U.clamp(Math.floor((avail - 2 * 5 - 18) / 3), 54, 104);
        board.style.setProperty('--cell', cell + 'px');
      }
      fit();
      api.timeout(fit, 0);
      if (window.ResizeObserver) {
        ro = new ResizeObserver(fit);
        ro.observe(root);
      }

      /* ---------------- 流程 ---------------- */
      function reset() {
        bd = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        turn = HUM;
        over = false;
        thinking = false;
        moveCount = 0;
        api.setScore(0);
        paint();
        api.setStatus(statusText());
      }

      function statusText() {
        var s = '连胜 ' + streak;
        if (over) return s;
        return s + ' · ' + (turn === HUM ? '轮到你落子' : 'AI 思考中…');
      }

      function paint() {
        for (var i = 0; i < 9; i++) {
          var node = cellEls[i];
          var v = bd[i];
          node.textContent = v ? GLYPH[v] : '';
          node.style.background = '';
          node.style.boxShadow = '';
          node.style.opacity = over && !v ? '.55' : '1';
          node.style.fontSize = '';
          node.style.color = v === HUM ? '#1d4ed8' : '#0e7c8f';
        }
      }

      function tapCell(idx) {
        if (over || thinking || turn !== HUM) return;
        if (bd[idx]) { api.audio.play('wrong'); return; }
        play(idx, HUM);
      }

      function play(idx, c) {
        bd[idx] = c;
        moveCount++;
        var node = cellEls[idx];
        node.textContent = GLYPH[c];
        if (node.animate) {
          node.animate(
            [{ transform: 'scale(.4)', opacity: 0 },
             { transform: 'scale(1.18)' },
             { transform: 'scale(1)' }],
            { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        }
        api.audio.play(c === HUM ? 'move' : 'tick');

        var w = winnerOf(bd);
        if (w) { endRound(w); return; }
        if (isFull(bd)) { endRound(0); return; }

        turn = c === HUM ? CMP : HUM;
        api.setStatus(statusText());
        if (turn === CMP) scheduleAI();
      }

      function scheduleAI() {
        if (over || turn !== CMP) return;
        thinking = true;
        aiTimer = api.timeout(function () {
          if (over) { thinking = false; return; }
          thinking = false;
          var empties = [], i;
          for (i = 0; i < 9; i++) if (!bd[i]) empties.push(i);
          if (!empties.length) { endRound(0); return; }
          var mv;
          if (level === 1) mv = api.choice(empties);
          else if (level === 2) mv = api.chance(0.3) ? bestMove(bd) : api.choice(empties);
          else mv = bestMove(bd);
          play(mv, CMP);
        }, api.randInt(260, 470));
      }

      function endRound(w) {
        over = true;
        thinking = false;
        if (w === CMP) {
          streak = 0;
          api.audio.play('lose');
          api.setScore(0);
          api.setStatus(statusText());
          api.finish({
            win: false,
            title: 'AI 获胜',
            sub: '连胜中断，再战一局找回手感',
            icon: '🤖',
            metrics: { ttt_wins: 0 }
          });
          return;
        }
        if (w === HUM) {
          streak++;
          var line = winLineOf(bd);
          if (line) {
            for (var i = 0; i < 3; i++) {
              cellEls[line[i]].style.background = 'rgba(13,149,171,.22)';
              cellEls[line[i]].style.boxShadow = 'inset 0 0 0 2px rgba(13,149,171,.75)';
            }
          }
          var score = Math.max(1, 1000 - moveCount * 10);
          api.audio.play('win');
          api.setScore(score);
          api.setStatus(statusText());
          api.finish({
            win: true,
            title: '你赢了！',
            sub: '用 ' + moveCount + ' 手赢下 · 连胜 ' + streak + ' 场',
            icon: '🏆',
            metrics: { ttt_wins: 1 }
          });
          return;
        }
        // 平局
        streak = 0;
        api.audio.play('tick');
        api.setScore(200);
        api.setStatus(statusText());
        api.finish({
          win: false,
          title: '平局',
          sub: '棋盘已满，谁也没能连成三子',
          icon: '🤝',
          metrics: { ttt_wins: 0 }
        });
      }

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name.length === 1 && name >= '1' && name <= '9') {
          tapCell(Number(name) - 1);
        }
      });

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
      var again = U.el('button', 'chip', '重开');
      again.type = 'button';
      again.addEventListener('click', function () {
        api.audio.play('click');
        reset();
      });
      bar.appendChild(again);

      reset();
      return {
        destroy: function () {
          if (ro) ro.disconnect();
          if (aiTimer) api.clearTimeout(aiTimer);
        },
        restart: reset
      };
    }
  });
})(window.GH);
