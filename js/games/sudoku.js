/* ===========================================================
   sudoku.js — 数独（DOM 9×9 网格实现）
   题面内联，每题均由「唯一解」程序校验过：挖空后解仍唯一。
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  /* 5 道题：solution 为完整解，puzzle 为挖空题面（0 = 空） */
  var PUZZLES = [
    { name: '入门', base: 1600,
      solution:
      '297865431413729856658413279341972568729586314865341792134297685586134927972658143',
      puzzle:
      '207060030000000850058413200340072060729006014060300090034297085086104920972050100' },
    { name: '简单', base: 1800,
      solution:
      '469253718817496253235718964523187649781964532946532187694325871352871496178649325',
      puzzle:
      '069200700800406250030000000023107040781060532000002080090325001350070406078000320' },
    { name: '中等', base: 2000,
      solution:
      '521749386386251479479836521658412937937568142142397658763185294815924763294673815',
      puzzle:
      '021040000000050470009036020650010030907060040100300008003185090815000703004070000' },
    { name: '困难', base: 2200,
      solution:
      '153297846468513792927648315816935274742186539395472681579824163284361957631759428',
      puzzle:
      '000090000400503092027600000016900270002086000300402000000020003280001900000759000' },
    { name: '专家', base: 2400,
      solution:
      '596748321132569847784123965218635794653497182479281536361954278827316459945872613',
      puzzle:
      '096000000000509040780000000208605700600090000000001000061900008807000000005072610' }
  ];

  /* 下一题索引（跨会话保留，切题不用结束本局） */
  var NEXT = 0;

  var STYLE = [
    '.sd-board{--sc:40px;display:grid;grid-template-columns:repeat(9,var(--sc));',
    'grid-template-rows:repeat(9,var(--sc));padding:4px;border-radius:12px;',
    'background:rgba(255,255,255,.82);border:2px solid rgba(13,149,171,.38);box-shadow:var(--shadow-1);',
    'touch-action:manipulation;}',
    '.sd-cell{display:grid;place-items:center;font-size:calc(var(--sc)*.52);font-weight:700;',
    'color:#0d7f92;background:rgba(24,38,82,.02);border-right:1px solid rgba(24,38,82,.09);',
    'border-bottom:1px solid rgba(24,38,82,.09);cursor:pointer;line-height:1;',
    'user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;',
    'transition:background .12s var(--ease),color .12s var(--ease);}',
    '.sd-cell.br{border-right:2px solid rgba(13,149,171,.45);}',
    '.sd-cell.bb{border-bottom:2px solid rgba(13,149,171,.45);}',
    '.sd-cell.nr{border-right:0;}',
    '.sd-cell.nb{border-bottom:0;}',
    '.sd-cell.is-given{color:var(--text);background:rgba(24,38,82,.07);}',
    '.sd-cell.is-peer{background:rgba(13,149,171,.12);}',
    '.sd-cell.is-sel{background:rgba(13,149,171,.20);box-shadow:inset 0 0 0 2px rgba(13,149,171,.75);}',
    '.sd-cell.is-bad{color:#d93d59;background:rgba(217,61,89,.14);}',
    '.sd-cell.is-hint{color:#b8760a;background:rgba(184,118,10,.15);}',
    '.sd-pad{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;width:min(100%,330px);}',
    '.sd-key{padding:9px 0;border-radius:10px;border:1px solid var(--line);background:var(--panel);',
    'color:var(--text);font-size:16px;font-weight:700;text-align:center;cursor:pointer;',
    '-webkit-tap-highlight-color:transparent;transition:transform .1s,background .15s var(--ease);}',
    '.sd-key:hover{background:var(--panel-hi);}',
    '.sd-key:active{transform:scale(.93);background:rgba(13,149,171,.30);}'
  ].join('');

  function parse81(s) {
    var out = [];
    for (var i = 0; i < 81; i++) out.push(+s.charAt(i) || 0);
    return out;
  }

  GH.Hub.register({
    id: 'sudoku',
    name: '数独',
    icon: '📐',
    color: '#22d3ee',
    category: 'puzzle',
    tags: ['数字', '推理', '耐玩'],
    desc: '每行每列每宫填入 1-9 不重复。',
    hint: '点格子选中，按数字键或下方数字面板填数',
    touch: null,

    mount: function (root, api) {
      var idx = NEXT % PUZZLES.length;
      var sol = [], vals = [], given = [], hintCell = [];
      var nodes = [];
      var selected = -1;
      var errors = 0, hints = 0, sec = 0, done = false;

      /* ---------------- 结构 ---------------- */
      var style = U.el('style');
      style.textContent = STYLE;
      root.appendChild(style);

      var board = U.el('div', 'sd-board');
      root.appendChild(board);

      api.setStatus('');

      var bar = api.ctrlBar();
      var hintBtn = U.el('button', 'chip', '💡 提示');
      hintBtn.type = 'button';
      hintBtn.addEventListener('click', function () { GH.Audio.play('click'); useHint(); });
      bar.appendChild(hintBtn);

      var retry = U.el('button', 'chip', '重开本题');
      retry.type = 'button';
      retry.addEventListener('click', function () { GH.Audio.play('click'); start(idx); });
      bar.appendChild(retry);

      var nextBtn = U.el('button', 'chip', '下一题 →');
      nextBtn.type = 'button';
      nextBtn.addEventListener('click', function () {
        GH.Audio.play('click');
        NEXT = (idx + 1) % PUZZLES.length;
        start(NEXT);
      });
      bar.appendChild(nextBtn);

      /* 数字面板（触屏必备） */
      var pad = U.el('div', 'sd-pad');
      root.appendChild(pad);
      for (var d = 1; d <= 9; d++) {
        (function (v) {
          var k = U.el('div', 'sd-key', String(v));
          k.setAttribute('role', 'button');
          k.addEventListener('click', function () { input(v); });
          pad.appendChild(k);
        })(d);
      }
      var del = U.el('div', 'sd-key', '⌫');
      del.setAttribute('role', 'button');
      del.addEventListener('click', function () { input(0); });
      pad.appendChild(del);

      api.hint('数字面板可用手指点；<b style="color:#0d95ab">冲突</b>会标红，提示会扣分。');

      /* ---------------- 自适应 ---------------- */
      function fit() {
        var availW = Math.min(root.clientWidth || 360, 540) - 36;
        var availH = (window.innerHeight || 640) - 370;
        var sc = Math.floor(Math.min((availW - 14) / 9, (availH - 14) / 9));
        sc = U.clamp(sc, 24, 50);
        board.style.setProperty('--sc', sc + 'px');
      }
      var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(root);

      /* ---------------- 开局 ---------------- */
      function start(i) {
        idx = i % PUZZLES.length;
        sol = parse81(PUZZLES[idx].solution);
        vals = parse81(PUZZLES[idx].puzzle);
        given = vals.map(function (v) { return v > 0; });
        hintCell = [];
        for (var k = 0; k < 81; k++) hintCell.push(false);
        selected = -1;
        errors = 0; hints = 0; sec = 0; done = false;

        U.clear(board);
        nodes = [];
        fit();
        for (var i2 = 0; i2 < 81; i2++) {
          (function (c) {
            var r = Math.floor(c / 9), col = c % 9;
            var cls = 'sd-cell';
            if (col === 2 || col === 5) cls += ' br';
            if (col === 8) cls += ' nr';
            if (r === 2 || r === 5) cls += ' bb';
            if (r === 8) cls += ' nb';
            var n = U.el('div', cls);
            n.addEventListener('click', function () { select(c); });
            board.appendChild(n);
            nodes.push(n);
          })(i2);
        }
        paint();
        updateScore();
        updateStatus();
      }

      /* ---------------- 冲突检测 ---------------- */
      function conflicts() {
        var bad = {};
        function mark(list) {
          var seen = {};
          list.forEach(function (i) {
            var v = vals[i];
            if (!v) return;
            if (!seen[v]) seen[v] = [];
            seen[v].push(i);
          });
          Object.keys(seen).forEach(function (k) {
            if (seen[k].length > 1) seen[k].forEach(function (i) { bad[i] = true; });
          });
        }
        var r, c, i, j;
        for (r = 0; r < 9; r++) {
          var row = [];
          for (c = 0; c < 9; c++) row.push(r * 9 + c);
          mark(row);
        }
        for (c = 0; c < 9; c++) {
          var col = [];
          for (r = 0; r < 9; r++) col.push(r * 9 + c);
          mark(col);
        }
        for (var b = 0; b < 9; b++) {
          var box = [];
          var br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
          for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) box.push((br + i) * 9 + bc + j);
          mark(box);
        }
        return bad;
      }

      function paint() {
        var bad = conflicts();
        var sr = Math.floor(selected / 9), sc2 = selected % 9;
        for (var i = 0; i < 81; i++) {
          var n = nodes[i];
          var cls = n.className;
          cls = cls.replace(/ is-(given|peer|sel|bad|hint)/g, '');
          var r = Math.floor(i / 9), c = i % 9;
          if (given[i]) cls += ' is-given';
          if (hintCell[i]) cls += ' is-hint';
          if (bad[i]) cls += ' is-bad';
          if (selected >= 0 && i !== selected &&
            (r === sr || c === sc2 || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc2 / 3)))) {
            cls += ' is-peer';
          }
          if (i === selected) cls += ' is-sel';
          n.className = cls;
          n.textContent = vals[i] ? String(vals[i]) : '';
        }
      }

      function updateStatus() {
        var filled = 0;
        for (var i = 0; i < 81; i++) if (vals[i]) filled++;
        api.setStatus(PUZZLES[idx].name + ' · 已填 ' + filled + '/81 · 填错 ' + errors +
          ' · 提示 ' + hints + ' · 用时 ' + U.fmtClock(sec));
      }

      function score() {
        return Math.max(0, PUZZLES[idx].base - errors * 30 - hints * 80);
      }
      function updateScore() { api.setScore(score()); }

      /* ---------------- 操作 ---------------- */
      function select(i) {
        selected = i;
        api.audio.play('click');
        paint();
      }

      function input(v) {
        if (done || selected < 0) return;
        if (given[selected]) { api.audio.play('tick'); return; }

        if (v === 0) {
          if (!vals[selected]) return;
          vals[selected] = 0;
          hintCell[selected] = false;
          api.audio.play('click');
        } else if (vals[selected] === v) {
          vals[selected] = 0;
          hintCell[selected] = false;
          api.audio.play('click');
        } else {
          vals[selected] = v;
          hintCell[selected] = false;
          if (v !== sol[selected]) { errors++; api.audio.play('tick'); }
          else api.audio.play('select');
        }

        paint();
        updateStatus();
        updateScore();
        checkWin();
      }

      function useHint() {
        if (done) return;
        var empties = [], wrongs = [];
        for (var i = 0; i < 81; i++) {
          if (given[i]) continue;
          if (vals[i] !== sol[i]) (vals[i] ? wrongs : empties).push(i);
        }
        var pool = wrongs.length ? wrongs : empties;
        if (!pool.length) return;
        var pick = pool[api.randInt(0, pool.length - 1)];
        vals[pick] = sol[pick];
        hintCell[pick] = true;
        hints++;
        selected = pick;
        api.audio.play('coin');
        api.toast('已填入一个正确答案（-' + 80 + ' 分）', { icon: '💡' });
        paint();
        updateStatus();
        updateScore();
        checkWin();
      }

      function checkWin() {
        for (var i = 0; i < 81; i++) if (vals[i] !== sol[i]) return;
        done = true;
        api.audio.play('win');
        NEXT = (idx + 1) % PUZZLES.length;
        api.finish({
          win: true,
          title: '第 ' + (idx + 1) + ' 题完成！',
          sub: '难度 ' + PUZZLES[idx].name + ' · 填错 ' + errors + ' 次 · 提示 ' + hints +
            ' 次 · 用时 ' + U.fmtClock(sec),
          icon: '📐',
          retryText: '下一题 →',
          metrics: { sudoku_wins: 1, sudoku_level: idx + 1 }
        });
      }

      /* ---------------- 输入 ---------------- */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (/^[1-9]$/.test(name)) input(+name);
        else if (name === '0' || name === 'backspace' || name === 'delete') input(0);
      });

      /* ---------------- 计时 ---------------- */
      api.interval(function () {
        if (done || api.isPaused()) return;
        sec++;
        updateStatus();
      }, 1000);

      fit();
      api.timeout(fit, 0);
      start(NEXT);

      return {
        destroy: function () { if (ro) ro.disconnect(); },
        restart: function () { start(NEXT); }
      };
    }
  });
})(window.GH);
