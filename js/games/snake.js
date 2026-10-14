/* ===========================================================
   snake.js — 贪吃蛇（Canvas 样板游戏）
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

      /* 速度档位：base = 起始每格毫秒，accel = 每吃一个果子提速的毫秒，min = 上限速度 */
      var SPEEDS = {
        easy:   { base: 235, accel: 3.0, min: 100, label: '轻松' },
        normal: { base: 185, accel: 3.2, min: 82,  label: '标准' },
        hard:   { base: 145, accel: 3.2, min: 70,  label: '挑战' }
      };
      var speedKey = 'normal';

      var snake, dir, queue, food, alive, phase, acc, foodEaten, particles, flash, t, lastT;

      function reset() {
        snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        dir = { x: 1, y: 0 };
        queue = [];
        alive = true;
        phase = 'ready';          // 按下方向键之前不移动，先看清开局
        acc = 0;
        foodEaten = 0;
        particles = [];
        flash = 0;
        t = 0;
        lastT = 0;
        placeFood();
        api.setScore(0);
        syncStatus();
      }

      function stepMs() {
        var sp = SPEEDS[speedKey];
        return Math.max(sp.min, sp.base - foodEaten * sp.accel);
      }

      function syncStatus() {
        if (phase === 'ready') {
          api.setStatus('按方向键开始 · 速度「' + SPEEDS[speedKey].label + '」');
          return;
        }
        api.setStatus('长度 ' + snake.length + ' · 速度 ' + (foodEaten + 1) + ' 档 · ' +
          SPEEDS[speedKey].label + '（' + Math.round(stepMs()) + 'ms/格）');
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

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
          foodEaten++;
          api.addScore(10);
          api.audio.play('eat');
          burst(head.x, head.y);
          placeFood();
          syncStatus();
        } else {
          snake.pop();
        }
      }

      function die(reason) {
        alive = false;
        flash = 1;
        api.audio.play('lose');
        api.finish({
          title: '游戏结束',
          sub: reason + ' · 长度 ' + snake.length + ' · 吃掉 ' + foodEaten + ' 个果子',
          icon: '💥',
          metrics: { snake_len: snake.length, snake_food: foodEaten }
        });
      }

      function burst(gx, gy) {
        for (var i = 0; i < 12; i++) {
          var a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
          var sp = api.randFloat(0.9, 2.6);
          particles.push({
            x: gx * CELL + CELL / 2,
            y: gy * CELL + CELL / 2,
            vx: Math.cos(a) * sp * CELL * 0.06,
            vy: Math.sin(a) * sp * CELL * 0.06,
            life: 1
          });
        }
      }

      /* ------------------------ 绘制 ------------------------ */
      function draw() {
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

        // 食物
        if (food) {
          var pulse = 1 + Math.sin(t * 7) * 0.12;
          var fx = food.x * CELL + CELL / 2;
          var fy = food.y * CELL + CELL / 2;
          ctx.save();
          ctx.shadowColor = 'rgba(226,65,92,.75)';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#e2415c';
          ctx.beginPath();
          ctx.arc(fx, fy, CELL * 0.3 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath();
          ctx.arc(fx - CELL * 0.09, fy - CELL * 0.11, CELL * 0.075, 0, Math.PI * 2);
          ctx.fill();
        }

        // 蛇身
        for (var i = snake.length - 1; i >= 0; i--) {
          var s = snake[i];
          var k = i / Math.max(1, snake.length - 1);
          var pad = i === 0 ? 1.5 : 2.5;
          var x = s.x * CELL + pad;
          var y = s.y * CELL + pad;
          var w = CELL - pad * 2;

          if (i === 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(15,154,108,.7)';
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#0f9a6c';
            rr(ctx, x, y, w, w, 7);
            ctx.fill();
            ctx.restore();
            drawEyes(x, y, w);
          } else {
            var c = Math.round(110 - 20 * k);
            ctx.fillStyle = 'rgb(' + Math.round(16 + 40 * k) + ',' + Math.round(160 - 50 * k) + ',' + c + ')';
            ctx.globalAlpha = 0.55 + 0.45 * (1 - k);
            rr(ctx, x, y, w, w, 6);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        // 粒子
        for (var p = particles.length - 1; p >= 0; p--) {
          var pt = particles[p];
          pt.x += pt.vx; pt.y += pt.vy;
          pt.vy += 0.06;
          pt.life -= 0.035;
          if (pt.life <= 0) { particles.splice(p, 1); continue; }
          ctx.globalAlpha = pt.life;
          ctx.fillStyle = '#e2415c';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 * pt.life + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 死亡闪红
        if (flash > 0) {
          ctx.fillStyle = 'rgba(217,61,89,' + (flash * 0.32) + ')';
          ctx.fillRect(0, 0, W, H);
          flash -= 0.03;
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
          U.label(ctx, '速度：' + SPEEDS[speedKey].label, W / 2, H / 2 + 26, {
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
        draw();
      });

      /* ------------------------ 输入 ------------------------ */
      api.onKey(function (name, e, phaseOfKey) {
        if (phaseOfKey !== 'down') return;
        if (name === 'up') turn(0, -1);
        else if (name === 'down') turn(0, 1);
        else if (name === 'left') turn(-1, 0);
        else if (name === 'right') turn(1, 0);
      });

      /* ------------------------ 速度档位按钮 ------------------------ */
      var bar = api.ctrlBar();
      var chipEls = {};
      ['easy', 'normal', 'hard'].forEach(function (k) {
        var b = U.el('button', 'chip' + (k === speedKey ? ' is-active' : ''), SPEEDS[k].label);
        b.type = 'button';
        b.addEventListener('click', function () {
          api.audio.play('click');
          speedKey = k;
          for (var q in chipEls) {
            if (chipEls.hasOwnProperty(q)) chipEls[q].classList.toggle('is-active', q === k);
          }
          reset();
        });
        chipEls[k] = b;
        bar.appendChild(b);
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
