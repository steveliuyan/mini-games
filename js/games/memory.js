/* ===========================================================
   memory.js — 记忆翻牌（DOM 网格实现）
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  /* 牌面 emoji 池（6×6 需要 18 对） */
  var EMOJIS = [
    '🍎', '🍌', '🍇', '🍓', '🍑', '🍍', '🥝', '🍒', '🍉', '🥕', '🌽', '🍄',
    '🌸', '🍀', '⭐', '🌙', '⚡', '🔥', '💎', '🎈', '🎵', '🚀', '🍩', '🐳'
  ];

  /* 3D 翻转所需的样式（挂到 board 上，随会话一起销毁） */
  var STYLE = [
    '.mem-board{display:grid;gap:8px;padding:10px;border-radius:14px;',
    'background:rgba(255,255,255,.78);border:1px solid var(--line);box-shadow:var(--shadow-1);}',
    '.mem-card{position:relative;width:var(--mc,64px);height:var(--mc,64px);',
    'perspective:620px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
    '.mem-in{position:relative;width:100%;height:100%;transform-style:preserve-3d;',
    'transition:transform .42s cubic-bezier(.22,1,.36,1);}',
    '.mem-card.is-open .mem-in{transform:rotateY(180deg);}',
    '.mem-face{position:absolute;inset:0;display:grid;place-items:center;border-radius:10px;',
    'font-size:calc(var(--mc,64px)*.46);line-height:1;',
    'backface-visibility:hidden;-webkit-backface-visibility:hidden;',
    'user-select:none;-webkit-user-select:none;}',
    '.mem-back{background:linear-gradient(145deg,#8b7cf0,#6d5ce0);',
    'border:1px solid rgba(123,92,240,.5);color:rgba(255,255,255,.55);font-size:calc(var(--mc,64px)*.34);}',
    '.mem-front{transform:rotateY(180deg);background:linear-gradient(145deg,#ffffff,#eef2fb);',
    'border:1px solid rgba(123,92,240,.28);}',
    '.mem-card.is-done .mem-front{background:linear-gradient(145deg,#d9f7e9,#b3ecd4);',
    'border-color:rgba(15,154,108,.55);box-shadow:0 0 14px rgba(15,154,108,.28);}',
    '.mem-card.is-miss .mem-front{border-color:rgba(217,61,89,.7);',
    'animation:memShake .42s var(--ease);}',
    '@keyframes memShake{0%,100%{transform:rotateY(180deg) translateX(0);}',
    '25%{transform:rotateY(180deg) translateX(-5px);}',
    '75%{transform:rotateY(180deg) translateX(5px);}}'
  ].join('');

  GH.Hub.register({
    id: 'memory',
    name: '记忆翻牌',
    icon: '🧠',
    color: '#a78bfa',
    category: 'puzzle',
    tags: ['记忆', '眼力', '休闲'],
    desc: '翻牌配对，找齐所有相同图案。',
    hint: '点击卡片翻开，两张相同即配对',
    touch: null,

    mount: function (root, api) {
      var N = 4;                  // 当前棋盘边长
      var cards = [];             // {v, open, matched, node}
      var firstIdx = -1;          // 已翻开待配对的牌
      var lock = false;           // 配错等待翻回期间锁输入
      var done = false;
      var flips = 0, mistakes = 0, sec = 0, matchedCount = 0, pairs = 8;

      /* ---------------- 结构 ---------------- */
      var style = U.el('style');
      style.textContent = STYLE;
      root.appendChild(style);

      var board = U.el('div', 'mem-board');
      root.appendChild(board);

      var bar = api.ctrlBar();
      var chips = [];
      [[4, '4×4 轻松'], [6, '6×6 挑战']].forEach(function (it) {
        var b = U.el('button', 'chip', it[1]);
        b.type = 'button';
        b.addEventListener('click', function () {
          if (N === it[0]) return;
          GH.Audio.play('click');
          N = it[0];
          paintChips();
          reset();
        });
        chips.push({ n: it[0], node: b });
        bar.appendChild(b);
      });
      var retry = U.el('button', 'chip', '重开');
      retry.type = 'button';
      retry.addEventListener('click', function () { GH.Audio.play('click'); reset(); });
      bar.appendChild(retry);

      function paintChips() {
        chips.forEach(function (c) { c.node.classList.toggle('is-active', c.n === N); });
      }

      /* ---------------- 自适应 ---------------- */
      function fit() {
        var availW = Math.min(root.clientWidth || 360, 540) - 36;
        var availH = (window.innerHeight || 640) - 300;
        var cell = Math.min(
          (availW - (N + 1) * 8 - 20) / N,
          (availH - (N + 1) * 8 - 20) / N
        );
        cell = U.clamp(Math.floor(cell), 34, 84);
        board.style.setProperty('--mc', cell + 'px');
        board.style.gridTemplateColumns = 'repeat(' + N + ', var(--mc))';
      }
      var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(root);

      api.setStatus('');
      api.hint('点击翻开两张卡片，图案相同即配对；<b style="color:#6d4de0">零失误</b>通关可解锁成就。');

      /* ---------------- 计分 ---------------- */
      function score() { return Math.max(0, 1000 - flips * 10 - sec * 2); }
      function updateScore() { api.setScore(score()); }

      function updateStatus() {
        api.setStatus('已配对 ' + matchedCount + '/' + pairs + ' · 翻牌 ' + flips +
          ' 次 · 失误 ' + mistakes + ' · 用时 ' + U.fmtClock(sec));
      }

      /* ---------------- 开局 ---------------- */
      function reset() {
        pairs = (N * N) / 2;
        done = false; lock = false; firstIdx = -1;
        flips = 0; mistakes = 0; sec = 0; matchedCount = 0;

        var pool = api.shuffle(EMOJIS.slice()).slice(0, pairs);
        var deck = api.shuffle(pool.concat(pool));

        cards = deck.map(function (v) {
          return { v: v, open: false, matched: false, node: null };
        });

        U.clear(board);
        fit();
        cards.forEach(function (c, i) {
          var card = U.el('div', 'mem-card');
          var inner = U.el('div', 'mem-in');
          var back = U.el('div', 'mem-face mem-back', '?');
          var front = U.el('div', 'mem-face mem-front', c.v);
          inner.appendChild(front);
          inner.appendChild(back);
          card.appendChild(inner);
          card.addEventListener('click', function () { flip(i); });
          board.appendChild(card);
          c.node = card;
        });

        api.setScore(0);
        updateScore();
        updateStatus();
        paintChips();
      }

      /* ---------------- 翻牌 ---------------- */
      function flip(i) {
        if (done || lock) return;
        var c = cards[i];
        if (!c || c.open || c.matched) return;

        c.open = true;
        c.node.classList.add('is-open');
        flips++;
        api.audio.play('flip');
        updateScore();

        if (firstIdx < 0) { firstIdx = i; updateStatus(); return; }

        var a = cards[firstIdx];
        firstIdx = -1;

        if (a.v === c.v) {
          a.matched = true; c.matched = true;
          a.node.classList.add('is-done');
          c.node.classList.add('is-done');
          matchedCount++;
          api.audio.play('correct');
          updateStatus();
          if (matchedCount === pairs) win();
          return;
        }

        /* 配错：700ms 后一起翻回 */
        mistakes++;
        lock = true;
        a.node.classList.add('is-miss');
        c.node.classList.add('is-miss');
        api.audio.play('wrong');
        updateStatus();
        api.timeout(function () {
          a.open = false; c.open = false;
          a.node.classList.remove('is-open', 'is-miss');
          c.node.classList.remove('is-open', 'is-miss');
          lock = false;
        }, 700);
      }

      function win() {
        done = true;
        api.audio.play('win');
        api.finish({
          win: true,
          title: '全部配对！',
          sub: (mistakes === 0 ? '✨ 零失误通关 · ' : '失误 ' + mistakes + ' 次 · ') +
            '翻牌 ' + flips + ' 次 · 用时 ' + U.fmtClock(sec),
          icon: '🧠',
          metrics: {
            memory_pairs: pairs,
            memory_mistakes: mistakes,
            memory_perfect: mistakes === 0 ? 1 : 0
          }
        });
      }

      /* ---------------- 计时 ---------------- */
      api.interval(function () {
        if (done || api.isPaused()) return;
        sec++;
        updateStatus();
        updateScore();
      }, 1000);

      fit();
      api.timeout(fit, 0);
      reset();

      return {
        destroy: function () { if (ro) ro.disconnect(); },
        restart: reset
      };
    }
  });
})(window.GH);
