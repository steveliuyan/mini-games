/* ===========================================================
   snake.js — 贪吃蛇（Canvas 样板游戏）
   渲染插值平滑移动 + 吃果挤压/粒子 + 死亡逐段变红演出 + 难度持久化
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'snake',
    name: '贪吃蛇',
    icon: '🐍',
    color: '#34d399',
    category: 'classic',
    tags: ['经典', '反应', '耐玩'],
    desc: '吃果子不断变长，别撞墙，也别咬到自己。',
    hint: '方向键 / WASD 转向，空格暂停',
    touch: 'swipe+dpad',

    mount: function (root, api) {
      var N = 20, CELL = 24, W = N * CELL, H = N * CELL;
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;
      var rr = U.rr;

      /* 难度档位：base = 起始每格毫秒，accel = 每吃一个果子提速的毫秒，min = 上限速度 */
      var LV = [
        { name: '轻松', base: 235, accel: 3.0, min: 100 },
        { name: '标准', base: 185, accel: 3.2, min: 82 },
        { name: '挑战', base: 145, accel: 3.2, min: 70 }
      ];

      var snake, prev, dir, queue, food, alive, phase, acc, foodEaten;
      var particles, flash, t, lastT, deathT, reported, squash, foodPop, deathReason;

      function reset() {
        snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        prev = snake.map(function (s) { return { x: s.x, y: s.y }; });
        dir = { x: 1, y: 0 };
        queue = [];
        alive = true;
        phase = 'ready';          // 按下方向键之前不移动，先看清开局
        acc = 0;
        foodEaten = 0;
        particles = [];
        flash = 0;
        deathT = 0;
        reported = false;
        squash = 0;
        foodPop = 0;
        deathReason = '';
        t = 0;
        lastT = 0;
        placeFood();
        api.setScore(0);
        syncStatus();
      }

      function stepMs() {
        var sp = lvBar.lv();
        return Math.max(sp.min, sp.base - foodEaten * sp.accel);
      }

      function syncStatus() {
        if (phase === 'ready') {
          api.setStatus('按方向键开始 · 难度「' + lvBar.lv().name + '」');
          return;
        }
        api.setStatus('长度 ' + snake.length + ' · 速度 ' + (foodEaten + 1) + ' 档 · ' +
          lvBar.lv().name + '（' + Math.round(stepMs()) + 'ms/格）');
      }

      function placeFood() {
        var tries = 0;
        do {
          food = { x: api.randInt(0, N - 1), y: api.randInt(0, N - 1) };
          tries++;
        } while (occupied(food) && tries < 500);
      }

      function occupied(c) {
        for (var i = 0; i < snake.length; i++) {
          if (snake[i].x === c.x && snake[i].y === c.y) return true;
        }
        return false;
      }

      function turn(nx, ny) {
        if (!alive) return;
        if (phase === 'ready') {
          phase = 'play';
          api.audio.play('select');
          syncStatus();                 // 起步后立刻刷新状态行
          // 起步瞬间按到反向键时：只用于开始，不改变方向（否则会直接撞自己）
          if (dir.x + nx === 0 && dir.y + ny === 0) return;
        }
        var last = queue.length ? queue[queue.length - 1] : dir;
        if (last.x + nx === 0 && last.y + ny === 0) return; // 禁止 180° 回头
        if (last.x === nx && last.y === ny) return;
        if (queue.length < 3) queue.push({ x: nx, y: ny });
      }

      function step() {
        if (queue.length) dir = queue.shift();
        var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N) return die('撞墙了');
        // 尾巴这一步会移开，所以允许进入尾格
        var ignoreTail = !(head.x === food.x && head.y === food.y);
        var limit = ignoreTail ? snake.length - 1 : snake.length;
        for (var i = 0; i < limit; i++) {
          if (snake[i].x === head.x && snake[i].y === head.y) return die('咬到自己了');
        }

        prev = snake.map(function (s) { return { x: s.x, y: s.y }; });
        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
          foodEaten++;
          api.addScore(10);
          api.audio.play('eat');
          burst(head.x, head.y);
          squash = 1;
          placeFood();
          foodPop = 1;
          syncStatus();
        } else {
          snake.pop();
        }
      }

      function die(reason) {
        if (!alive) return;
        alive = false;
        flash = 1;
        deathReason = reason;
        api.audio.play('lose');
        // 死亡粒子（绿色身体炸散）
        for (var i = 0; i < Math.min(snake.length, 40); i++) {
          var s = snake[i];
          var a = Math.random() * Math.PI * 2;
          var sp = api.randFloat(30, 130);
          particles.push({
            x: s.x * CELL + CELL / 2, y: s.y * CELL + CELL / 2,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
            life: 1, red: false
          });
        }
        // 死亡演出：逐段变红抖动 ~0.7s 后再弹结算框
        api.timeout(function () {
          if (reported || api.isFinished()) return;
          reported = true;
          api.finish({
            title: '游戏结束',
            sub: deathReason + ' · 长度 ' + snake.length + ' · 吃掉 ' + foodEaten + ' 个果子',
            icon: '💥',
            metrics: { snake_len: snake.length, snake_food: foodEaten }
          });
        }, 700);
      }

      function burst(gx, gy) {
        for (var i = 0; i < 12; i++) {
          var a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
          var sp = api.randFloat(50, 160);
          particles.push({
            x: gx * CELL + CELL / 2,
            y: gy * CELL + CELL / 2,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 1, red: true
          });
        }
      }

      /* 绿→红混合（死亡波浪），k 是身体位置渐变 */
      function bodyColor(k, redMix) {
        if (redMix <= 0) {
          return 'rgb(' + Math.round(16 + 40 * k) + ',' + Math.round(160 - 50 * k) + ',' + Math.round(110 - 20 * k) + ')';
        }
        return 'rgb(' +
          Math.round(U.lerp(16 + 40 * k, 217, redMix)) + ',' +
          Math.round(U.lerp(160 - 50 * k, 61, redMix)) + ',' +
          Math.round(U.lerp(110 - 20 * k, 89, redMix)) + ')';
      }

      /* ------------------------ 绘制 ------------------------ */
      function draw(dt) {
        // 背景棋盘
        ctx.fillStyle = '#f3f6fc';
        ctx.fillRect(0, 0, W, H);
        for (var y = 0; y < N; y++) {
          for (var x = 0; x < N; x++) {
            if ((x + y) % 2 === 0) {
              ctx.fillStyle = 'rgba(24,38,82,0.030)';
              ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
          }
        }

        // 边框光晕
        ctx.strokeStyle = alive ? 'rgba(15,154,108,.38)' : 'rgba(217,61,89,.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

        /* 步进进度 → 渲染插值系数（把离散步进平滑成连续滑动） */
        var alpha = 1;
        if (alive && phase === 'play') alpha = U.clamp(acc / stepMs(), 0, 1);
        alpha = U.ease.outQuad(alpha);

        // 食物（出场弹跳 + 呼吸脉冲）
        if (food) {
          if (foodPop > 0) foodPop = Math.max(0, foodPop - dt * 3.2);
          var pop = foodPop > 0 ? U.ease.outBack(1 - foodPop) : 1;
          var pulse = 1 + Math.sin(t * 7) * 0.10;
          var fx = food.x * CELL + CELL / 2;
          var fy = food.y * CELL + CELL / 2;
          ctx.save();
          ctx.shadowColor = 'rgba(226,65,92,.75)';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#e2415c';
          ctx.beginPath();
          ctx.arc(fx, fy, CELL * 0.3 * pulse * pop, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath();
          ctx.arc(fx - CELL * 0.09, fy - CELL * 0.11, CELL * 0.075 * pop, 0, Math.PI * 2);
          ctx.fill();
        }

        // 吃果挤压（头部瞬间放大回弹）
        if (squash > 0) squash = Math.max(0, squash - dt * 4.2);
        var headScale = squash > 0 ? 1 + U.ease.outQuad(squash) * 0.26 : 1;

        // 蛇身（prev→cur 插值滑动；死亡逐段变红抖动）
        var waveT = alive ? 0 : deathT * 3.4;
        for (var i = snake.length - 1; i >= 0; i--) {
          var s = snake[i];
          var pv = (prev[i] != null) ? prev[i] : s;
          var k = i / Math.max(1, snake.length - 1);
          var pad = i === 0 ? 1.5 : 2.5;
          var gx = U.lerp(pv.x, s.x, alpha);
          var gy = U.lerp(pv.y, s.y, alpha);
          var redMix = 0, jitterX = 0, jitterY = 0;
          if (!alive) {
            redMix = U.clamp(waveT - i * 0.14, 0, 1);
            var jt = Math.max(0, 1 - deathT * 1.6);
            jitterX = Math.sin(deathT * 46 - i * 1.3) * 2.2 * jt;
            jitterY = Math.cos(deathT * 41 - i) * 2.2 * jt;
          }
          var x = gx * CELL + pad + jitterX;
          var y = gy * CELL + pad + jitterY;
          var w = CELL - pad * 2;

          if (i === 0) {
            var hs = w * headScale;
            var hx = x - (hs - w) / 2;
            var hy = y - (hs - w) / 2;
            ctx.save();
            ctx.shadowColor = redMix > .5 ? 'rgba(217,61,89,.7)' : 'rgba(15,154,108,.7)';
            ctx.shadowBlur = 14;
            ctx.fillStyle = redMix > 0 ? bodyColor(0, redMix) : '#0f9a6c';
            rr(ctx, hx, hy, hs, hs, 7);
            ctx.fill();
            ctx.restore();
            drawEyes(hx, hy, hs);
          } else {
            ctx.fillStyle = bodyColor(k, redMix);
            ctx.globalAlpha = 0.55 + 0.45 * (1 - k);
            rr(ctx, x, y, w, w, 6);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        // 粒子（速度单位 px/秒，dt 推进，帧率无关）
        for (var p = particles.length - 1; p >= 0; p--) {
          var pt = particles[p];
          pt.x += pt.vx * dt; pt.y += pt.vy * dt;
          pt.vy += 260 * dt;
          pt.life -= dt * 1.9;
          if (pt.life <= 0) { particles.splice(p, 1); continue; }
          ctx.globalAlpha = pt.life;
          ctx.fillStyle = pt.red ? '#e2415c' : '#0f9a6c';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 * pt.life + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 死亡闪红
        if (flash > 0) {
          ctx.fillStyle = 'rgba(217,61,89,' + (flash * 0.30) + ')';
          ctx.fillRect(0, 0, W, H);
          flash = Math.max(0, flash - dt * 1.6);
        }

        // 开局待命提示
        if (phase === 'ready' && alive) {
          ctx.fillStyle = 'rgba(255,255,255,.86)';
          ctx.fillRect(0, H / 2 - 56, W, 112);
          var a = 0.6 + Math.sin(t * 3.4) * 0.4;
          ctx.globalAlpha = a;
          U.label(ctx, '按方向键开始', W / 2, H / 2 - 8, {
            font: 'bold 26px system-ui, sans-serif', fill: '#0f9a6c', align: 'center', baseline: 'middle'
          });
          U.label(ctx, '难度：' + lvBar.lv().name, W / 2, H / 2 + 26, {
            font: '14px system-ui, sans-serif', fill: '#6e7b96', align: 'center', baseline: 'middle'
          });
          ctx.globalAlpha = 1;
        }
      }

      function drawEyes(x, y, w) {
        var ex = dir.x, ey = dir.y;
        var cx1 = x + w / 2 + ex * w * 0.2;
        var cy1 = y + w / 2 + ey * w * 0.2;
        var ox = ey !== 0 ? w * 0.21 : 0;
        var oy = ex !== 0 ? w * 0.21 : 0;
        ctx.fillStyle = '#04170f';
        ctx.beginPath();
        ctx.arc(cx1 - ox, cy1 - oy, w * 0.10, 0, Math.PI * 2);
        ctx.arc(cx1 + ox, cy1 + oy, w * 0.10, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ------------------------ 主循环 ------------------------ */
      api.loop(function () {
        // 用真实时间推进，帧率无关（120/144Hz 屏幕不会变快）
        var now = performance.now();
        var dt = lastT ? Math.min(0.1, Math.max(0, (now - lastT) / 1000)) : 1 / 60;
        lastT = now;
        t += dt;
        if (!alive) deathT += dt;

        if (!api.isPaused() && alive && phase === 'play') {
          acc += dt * 1000;
          var ms = stepMs();
          var guard = 0;
          while (acc >= ms && alive && guard < 5) {
            acc -= ms;
            step();
            ms = stepMs();     // 吃到果子会提速，重新取
            guard++;
          }
          if (guard >= 5) acc = 0;   // 极端卡顿后不补偿，避免连跳
        }
        draw(dt);
      });

      /* ------------------------ 输入 ------------------------ */
      api.onKey(function (name, e, phaseOfKey) {
        if (phaseOfKey !== 'down') return;
        if (name === 'up') turn(0, -1);
        else if (name === 'down') turn(0, 1);
        else if (name === 'left') turn(-1, 0);
        else if (name === 'right') turn(1, 0);
      });

      /* ------------------------ 难度（持久化） ------------------------ */
      var lvBar = api.levelBar({
        levels: LV, label: '难度', dflt: 1,
        onPick: function () { reset(); }
      });

      reset();
      api.hint('吃掉 <b style="color:#d93d59">红色果子</b> 得 10 分，每吃一个提速一档。开局按方向键开始。');

      return {
        destroy: function () {},
        restart: reset
      };
    }
  });
})(window.GH);
