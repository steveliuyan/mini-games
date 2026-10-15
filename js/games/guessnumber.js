/* ===========================================================
   guessnumber.js — 猜数字（DOM）
   主玩法：系统出 1~N 的整数，玩家猜，系统回「太大 / 太小」；
   彩蛋模式：玩家心里想一个数，AI 用二分法在 7 次内猜出来。
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  var RANGES = [
    { id: 1, name: '简单', max: 50 },
    { id: 2, name: '普通', max: 100 },
    { id: 3, name: '困难', max: 200 }
  ];
  var MAX_TRIES = 10;      // 主玩法最多猜 10 次

  var level = 2;           // 数字范围难度（跨重开保留）
  var mode = 'me';         // 'me' = 我来猜，'ai' = AI 来猜

  GH.Hub.register({
    id: 'guessnumber',
    name: '猜数字',
    icon: '🔍',
    color: '#a78bfa',
    category: 'versus',
    tags: ['数字', '推理', '速战'],
    desc: '用最少次数猜中系统想好的数字。',
    hint: '输入数字后回车或点「猜」提交',
    touch: null,

    mount: function (root, api) {
      var secret, maxN, tries, history, over, lastSubmit, gen = 0;
      var aiLo, aiHi, aiCount, aiGuess;

      /* ---------------- DOM ---------------- */
      var meBox = U.el('div', 'gctrl');
      root.appendChild(meBox);

      var input = U.el('input', 'num-input');
      input.type = 'number';
      input.min = '1';
      input.setAttribute('inputmode', 'numeric');
      meBox.appendChild(input);

      var submitBtn = U.el('button', 'chip', '猜！');
      submitBtn.type = 'button';
      meBox.appendChild(submitBtn);

      var giveUpBtn = U.el('button', 'chip', '放弃');
      giveUpBtn.type = 'button';
      meBox.appendChild(giveUpBtn);

      var aiBox = U.el('div', 'gctrl');
      root.appendChild(aiBox);

      var lowBtn = U.el('button', 'chip', '太小了 ↑');
      lowBtn.type = 'button';
      var highBtn = U.el('button', 'chip', '太大了 ↓');
      highBtn.type = 'button';
      var hitBtn = U.el('button', 'chip', '猜中了 🎯');
      hitBtn.type = 'button';
      aiBox.appendChild(lowBtn);
      aiBox.appendChild(highBtn);
      aiBox.appendChild(hitBtn);

      api.setStatus('');
      api.hint('');

      var log = U.el('div', 'log');
      root.appendChild(log);

      /* ---------------- 状态 ---------------- */
      function rangeMax() {
        for (var i = 0; i < RANGES.length; i++) if (RANGES[i].id === level) return RANGES[i].max;
        return 100;
      }
      function aiLimit() { return Math.ceil(Math.log(rangeMax()) / Math.LN2); }

      /* 注意：.gctrl 自带 display:flex，作者样式优先于 [hidden]，必须显式设 display */
      function paintModes() {
        meBox.style.display = mode === 'me' ? 'flex' : 'none';
        aiBox.style.display = mode === 'ai' ? 'flex' : 'none';
      }

      function renderLog() {
        U.clear(log);
        if (!history.length) {
          log.appendChild(U.el('div', 'l-sys',
            mode === 'me' ? '还没有猜测记录…' : '点击下面的按钮，回答 AI 的每一次猜测。'));
          return;
        }
        for (var i = 0; i < history.length; i++) {
          var h = history[i];
          var cls = h.dir === 'hit' ? 'l-win' : (h.dir === 'low' ? 'l-me' : 'l-bad');
          var tail = h.dir === 'hit' ? '🎯 猜中！'
            : (h.dir === 'low' ? '太小了 ↑' : '太大了 ↓');
          var prefix = mode === 'ai' ? 'AI 第 ' + (i + 1) + ' 猜'
            : '第 ' + (i + 1) + ' 次';
          var row = U.el('div', cls);
          row.textContent = prefix + '：' + h.n + ' → ' + tail;
          log.appendChild(row);
        }
        log.scrollTop = log.scrollHeight;
      }

      function setStatusText(s) { api.setStatus(s); }

      /* ---------------- 开局 / 重开 ---------------- */
      /* 带代号的延时，避免重开后旧定时器继续推进 AI 猜测 */
      function scheduleAI(ms) {
        var my = gen;
        api.timeout(function () {
          if (my !== gen) return;
          nextAIGuess();
        }, ms);
      }

      function reset() {
        gen++;
        maxN = rangeMax();
        secret = api.randInt(1, maxN);
        tries = 0;
        history = [];
        over = false;
        lastSubmit = 0;
        aiLo = 1;
        aiHi = maxN;
        aiCount = 0;
        aiGuess = 0;

        input.value = '';
        input.max = String(maxN);
        input.placeholder = '1-' + maxN;
        input.disabled = false;

        paintModes();
        renderLog();
        api.setScore(0);

        if (mode === 'me') {
          setStatusText('1 ~ ' + maxN + '，你有 ' + MAX_TRIES + ' 次机会');
        } else {
          setStatusText('心里想一个 1 ~ ' + maxN + ' 的整数，AI 来猜');
          scheduleAI(600);
        }
      }

      /* ---------------- 主玩法：我来猜 ---------------- */
      function submit() {
        if (over || mode !== 'me') return;
        var now = performance.now();
        if (now - lastSubmit < 200) return;      // 防止回车 + 点击重复触发
        lastSubmit = now;

        var v = parseInt(input.value, 10);
        if (!v || v < 1 || v > maxN) {
          api.audio.play('wrong');
          api.toast('请输入 1 ~ ' + maxN + ' 的整数', { type: 'warn', icon: '⚠️' });
          return;
        }
        var dup = false, i;
        for (i = 0; i < history.length; i++) if (history[i].n === v) dup = true;
        if (dup) {
          api.audio.play('wrong');
          api.toast(v + ' 已经猜过了', { type: 'warn', icon: '🔁' });
          return;
        }

        tries++;
        input.value = '';

        if (v === secret) {
          history.push({ n: v, dir: 'hit' });
          renderLog();
          winGame(tries);
          return;
        }
        var dirLow = v < secret;   // 猜的比答案小 → 太小了
        history.push({ n: v, dir: dirLow ? 'low' : 'high' });
        renderLog();
        api.audio.play('tick');

        if (tries >= MAX_TRIES) { loseGame(); return; }
        setStatusText(dirLow ? '太小了 ↑ 还剩 ' + (MAX_TRIES - tries) + ' 次'
                             : '太大了 ↓ 还剩 ' + (MAX_TRIES - tries) + ' 次');
      }

      function winGame(n) {
        over = true;
        input.disabled = true;
        var score = Math.max(0, 1000 - n * 60);
        // 只有 3 次内猜中才写入 guess_best，否则写 0（存档取最大值，避免污染记录）
        var best = n <= 3 ? n : 0;
        api.setScore(score);
        api.audio.play('correct');
        setStatusText('用了 ' + n + ' 次猜到 ' + secret);
        api.finish({
          win: true,
          title: n <= 3 ? '神机妙算！' : '猜中啦！',
          sub: '答案就是 ' + secret + '，你用了 ' + n + ' 次',
          icon: n <= 3 ? '🧠' : '🎯',
          metrics: { guess_best: best }
        });
      }

      function loseGame(reason) {
        over = true;
        input.disabled = true;
        api.setScore(0);
        api.audio.play('lose');
        setStatusText('答案是 ' + secret);
        api.finish({
          win: false,
          title: reason === 'giveup' ? '已放弃' : '次数用完了',
          sub: '答案是 ' + secret + '，下次换个二分法试试',
          icon: reason === 'giveup' ? '🏳️' : '💀',
          metrics: { guess_best: 0 }
        });
      }

      /* ---------------- 彩蛋：AI 来猜 ---------------- */
      function nextAIGuess() {
        if (over || mode !== 'ai') return;
        if (aiLo > aiHi) {
          over = true;
          api.audio.play('win');
          setStatusText('你的回答前后矛盾，AI 认输了');
          api.finish({
            win: true,
            noScore: true,
            title: '你赢了！',
            sub: 'AI 说你给的提示前后矛盾，它猜不出来',
            icon: '🤔'
          });
          return;
        }
        aiCount++;
        aiGuess = Math.floor((aiLo + aiHi) / 2);
        api.audio.play('select');
        setStatusText('AI 第 ' + aiCount + ' 猜：' + aiGuess +
          '（范围 ' + aiLo + ' ~ ' + aiHi + '）');
      }

      function answer(dir) {
        if (over || mode !== 'ai') return;
        if (!aiGuess) return;
        history.push({ n: aiGuess, dir: dir });
        renderLog();
        if (dir === 'hit') {
          over = true;
          var lim = aiLimit();
          api.audio.play('correct');
          setStatusText('AI 用了 ' + aiCount + ' 次猜中');
          api.finish({
            win: false,
            noScore: true,
            title: aiCount <= lim ? 'AI 猜中了！' : 'AI 这次没赶上',
            sub: 'AI 用了 ' + aiCount + ' 次猜出 ' + aiGuess +
              '（二分法上限 ' + lim + ' 次）',
            icon: '🤖'
          });
          return;
        }
        if (dir === 'low') aiLo = aiGuess + 1;   // AI 猜小了，往大找
        else aiHi = aiGuess - 1;                 // AI 猜大了，往小找
        api.audio.play('tick');
        scheduleAI(420);
      }

      /* ---------------- 事件 ---------------- */
      submitBtn.addEventListener('click', submit);
      giveUpBtn.addEventListener('click', function () {
        if (over || mode !== 'me') return;
        api.audio.play('click');
        loseGame('giveup');
      });
      lowBtn.addEventListener('click', function () { answer('low'); });
      highBtn.addEventListener('click', function () { answer('high'); });
      hitBtn.addEventListener('click', function () { answer('hit'); });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });

      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name === 'enter') submit();
      });

      /* ---------------- 控件 ---------------- */
      var bar = api.ctrlBar();

      var lvBar = api.levelBar({
        levels: RANGES, label: '难度', dflt: 1,
        onPick: function (i, r) {
          level = r.id;
          reset();
          api.toast('范围 1 ~ ' + r.max, { icon: '🎚️' });
        }
      });
      level = RANGES[lvBar.cur()].id;

      var modeChips = [];
      [['me', '我来猜'], ['ai', 'AI 来猜']].forEach(function (m) {
        var b = U.el('button', 'chip' + (m[0] === mode ? ' is-active' : ''), m[1]);
        b.type = 'button';
        b.addEventListener('click', function () {
          mode = m[0];
          modeChips.forEach(function (o) { o.el.classList.toggle('is-active', o.id === mode); });
          api.audio.play('select');
          reset();
        });
        modeChips.push({ id: m[0], el: b });
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
      api.hint('猜中得分 = <b style="color:#6d4de0">1000 - 次数 × 60</b>，' +
        '用越少次数分越高；3 次内猜中可解锁隐藏成就。「AI 来猜」是彩蛋模式，不计分。');

      return {
        destroy: function () {},
        restart: reset
      };
    }
  });
})(window.GH);
