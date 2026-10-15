/* ===========================================================
   flappy.js — 像素鸟（街机反应）
   世界坐标 400x600，重力 + 跳跃冲量 + 随机管道
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'flappy',
    name: '像素鸟',
    icon: '🐤',
    color: '#fbbf24',
    category: 'arcade',
    tags: ['街机', '反应', '像素', '虐心'],
    desc: '点击让像素鸟穿过管道，别撞上去。',
    hint: '空格 / 点击屏幕 扇翅膀',
    touch: 'tap',

    mount: function (root, api) {
      var W = 400, H = 600;
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;
      var rr = U.rr;

      var GROUND = 524;              // 地面线
      var BIRD_X = 108, BR = 13;
      var GRAV = 1500, FLAP = -430, MAXFALL = 620;
      var PIPE_W = 62, SPACING = 210;

      var state, bird, pipes, score, groundX, cloudX, clouds, flash, over, t, last;
      var scorePop = 0, particles = [];

      /* 难度：间隙起点/下限/收窄速度、管速曲线 */
      var LV = [
        { name: '轻松', gap0: 182, gapMin: 148, gapK: 1.2, sp0: 122, spK: 1.7, spMax: 200 },
        { name: '标准', gap0: 168, gapMin: 124, gapK: 1.8, sp0: 138, spK: 2.2, spMax: 238 },
        { name: '挑战', gap0: 150, gapMin: 108, gapK: 2.2, sp0: 158, spK: 2.8, spMax: 276 }
      ];

      function reset() {
        state = 'ready';
        bird = { x: BIRD_X, y: 250, vy: 0, rot: 0 };
        pipes = [];
        score = 0;
        groundX = 0;
        cloudX = 0;
        clouds = [];
        for (var i = 0; i < 4; i++) {
          clouds.push({ x: api.randFloat(0, W), y: api.randFloat(50, 260), s: api.randFloat(0.6, 1.3) });
        }
        flash = 0;
        over = false;
        scorePop = 0;
        particles = [];
        t = 0; last = 0;
        api.setScore(0);
        syncStatus();
      }

      function syncStatus() {
        api.setStatus(state === 'ready' ? '准备开始 · 点击起飞 · 难度「' + lvBar.lv().name + '」'
          : (state === 'play' ? '已通过 ' + score + ' 根管道' : '结束 · 通过 ' + score + ' 根'));
      }

      function gapSize() {
        var c = lvBar.lv();
        return Math.max(c.gapMin, c.gap0 - score * c.gapK);   // 间隙随分数收窄
      }

      function pipeSpeed() {
        var c = lvBar.lv();
        return Math.min(c.spMax, c.sp0 + score * c.spK);
      }

      function spawnPipe() {
        var gap = gapSize();
        var top = api.randFloat(70, GROUND - gap - 70);
        pipes.push({ x: W + 20, top: top, gap: gap, passed: false });
      }

      function flap() {
        if (state === 'ready') {
          state = 'play';
          bird.vy = FLAP;
          spawnPipe();
          api.audio.play('flap');
          api.setStatus('已通过 0 根管道');
          return;
        }
        if (state !== 'play') return;
        bird.vy = FLAP;
        api.audio.play('flap');
      }

      function burst(x, y, color, n) {
        for (var i = 0; i < n; i++) {
          var a = Math.PI * 2 * i / n + Math.random() * 0.8;
          var sp = api.randFloat(30, 110);
          particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 1, color: color });
        }
      }

      function die(reason) {
        if (state !== 'play') return;
        state = 'over';
        over = true;
        flash = 1;
        api.audio.play('lose');
        burst(bird.x, bird.y, '#fbbf24', 12);
        api.setStatus('结束 · 通过 ' + score + ' 根');
        // 坠落动画 + 撞击闪光后弹结算
        api.timeout(function () {
          api.finish({
            title: '撞毁！',
            sub: reason + ' · 通过 ' + score + ' 根管道',
            icon: '🐤',
            metrics: { flappy_pipes: score }
          });
        }, 680);
      }

      function update(dt) {
        if (scorePop > 0) scorePop = Math.max(0, scorePop - dt * 3.4);
        for (var pi2 = particles.length - 1; pi2 >= 0; pi2--) {
          var pp = particles[pi2];
          pp.x += pp.vx * dt; pp.y += pp.vy * dt;
          pp.vy += 300 * dt; pp.life -= dt * 1.8;
          if (pp.life <= 0) particles.splice(pi2, 1);
        }
        var sp = state === 'play' ? pipeSpeed() : 60;
        groundX = (groundX - sp * dt) % 48;
        cloudX -= 12 * dt;
        if (cloudX < -W) cloudX += W;
        for (var i = 0; i < clouds.length; i++) {
          clouds[i].x -= (6 + clouds[i].s * 8) * dt;
          if (clouds[i].x < -70) {
            clouds[i].x = W + 40;
            clouds[i].y = api.randFloat(50, 260);
          }
        }

        if (state === 'ready') {
          // 待机小幅浮动
          bird.y = 250 + Math.sin(t * 3) * 8;
          bird.rot = 0;
          return;
        }

        if (state === 'over') {
          // 坠落动画
          bird.vy = Math.min(bird.vy + GRAV * dt, MAXFALL);
          bird.y = Math.min(bird.y + bird.vy * dt, GROUND - BR);
          bird.rot = Math.min(bird.rot + dt * 5, 1.4);
          if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
          return;
        }

        /* --- 游戏进行中 --- */
        bird.vy = Math.min(bird.vy + GRAV * dt, MAXFALL);
        bird.y += bird.vy * dt;
        // 上升抬头 / 下落低头
        var target = api.clamp(bird.vy / 520, -0.5, 1.1);
        bird.rot = api.lerp(bird.rot, target, Math.min(1, dt * 9));

        // 管道推进
        for (var p = pipes.length - 1; p >= 0; p--) {
          var pip = pipes[p];
          pip.x -= sp * dt;
          if (!pip.passed && pip.x + PIPE_W < bird.x - BR) {
            pip.passed = true;
            score++;
            api.addScore(1);
            api.audio.play('score');
            scorePop = 1;
            burst(bird.x + 20, bird.y, '#22c55e', 7);
            syncStatus();
          }
          if (pip.x < -PIPE_W - 30) pipes.splice(p, 1);
        }
        var lastP = pipes[pipes.length - 1];
        if (!lastP || lastP.x < W - SPACING) spawnPipe();

        collide();
      }

      function collide() {
        if (bird.y + BR >= GROUND) { bird.y = GROUND - BR; return die('撞到地面了'); }
        if (bird.y - BR < 0) { bird.y = BR; bird.vy = 0; }
        for (var i = 0; i < pipes.length; i++) {
          var p = pipes[i];
          if (p.x > bird.x + BR || p.x + PIPE_W < bird.x - BR) continue;
          var topRect = { x: p.x, y: 0, w: PIPE_W, h: p.top };
          var botRect = { x: p.x, y: p.top + p.gap, w: PIPE_W, h: GROUND - p.top - p.gap };
          if (U.circleRect(bird.x, bird.y, BR, topRect) || U.circleRect(bird.x, bird.y, BR, botRect)) {
            return die('撞到管道了');
          }
        }
      }

      /* ------------------------ 绘制 ------------------------ */
      function drawPipe(p) {
        var capH = 22;
        var grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
        grad.addColorStop(0, '#4ade80');
        grad.addColorStop(0.35, '#22c55e');
        grad.addColorStop(1, '#15803d');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x, 0, PIPE_W, p.top);
        ctx.fillRect(p.x, p.top + p.gap, PIPE_W, GROUND - p.top - p.gap);
        ctx.fillStyle = '#166534';
        ctx.fillRect(p.x + PIPE_W - 7, 0, 7, p.top);
        ctx.fillRect(p.x + PIPE_W - 7, p.top + p.gap, 7, GROUND - p.top - p.gap);
        // 管口
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - 4, p.top - capH, PIPE_W + 8, capH);
        ctx.fillRect(p.x - 4, p.top + p.gap, PIPE_W + 8, capH);
        ctx.fillStyle = '#166534';
        ctx.fillRect(p.x - 4, p.top - 3, PIPE_W + 8, 3);
        ctx.fillRect(p.x - 4, p.top + p.gap + capH - 3, PIPE_W + 8, 3);
      }

      function drawBird() {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rot);
        // 身体
        var bg = ctx.createLinearGradient(0, -BR, 0, BR);
        bg.addColorStop(0, '#fde68a');
        bg.addColorStop(1, '#f59e0b');
        rr(ctx, -BR - 1, -BR + 1, BR * 2 + 2, BR * 2 - 2, 6);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,53,15,.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 翅膀（随速度摆动）
        var wing = state === 'over' ? 1 : Math.sin(t * 16) * 0.5 + 0.5;
        rr(ctx, -BR + 1, -2 + wing * 3, 12, 8, 3);
        ctx.fillStyle = '#fcd34d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,53,15,.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.fillRect(2, -9, 9, 9);
        ctx.fillStyle = '#111827';
        ctx.fillRect(7, -7, 4, 5);
        // 喙
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(BR - 3, -1);
        ctx.lineTo(BR + 8, 3);
        ctx.lineTo(BR - 3, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function draw() {
        // 天空
        var sky = ctx.createLinearGradient(0, 0, 0, GROUND);
        sky.addColorStop(0, '#a3d7f7');
        sky.addColorStop(0.6, '#cfeafc');
        sky.addColorStop(1, '#eaf7ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, GROUND);

        // 云
        for (var i = 0; i < clouds.length; i++) {
          var c = clouds[i];
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          rr(ctx, c.x, c.y, 56 * c.s, 20 * c.s, 10 * c.s);
          ctx.fill();
          rr(ctx, c.x + 14 * c.s, c.y - 10 * c.s, 34 * c.s, 20 * c.s, 10 * c.s);
          ctx.fill();
        }

        // 管道
        for (var p = 0; p < pipes.length; p++) drawPipe(pipes[p]);

        // 地面
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(0, GROUND, W, 10);
        ctx.fillStyle = '#c08a3e';
        ctx.fillRect(0, GROUND + 10, W, H - GROUND - 10);
        ctx.fillStyle = 'rgba(120,72,20,.16)';
        for (var x = groundX; x < W; x += 48) {
          ctx.fillRect(x, GROUND + 22, 24, 10);
          ctx.fillRect(x + 20, GROUND + 48, 24, 10);
        }

        drawBird();

        // 穿管粒子
        for (var pt2 = 0; pt2 < particles.length; pt2++) {
          var pe = particles[pt2];
          ctx.globalAlpha = Math.max(0, pe.life);
          ctx.fillStyle = pe.color;
          ctx.beginPath();
          ctx.arc(pe.x, pe.y, 2 + 3 * pe.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 分数（得分瞬间弹跳）
        var spv = 1 + (scorePop > 0 ? U.ease.outQuad(scorePop) * 0.35 : 0);
        ctx.save();
        ctx.translate(W / 2, 76);
        ctx.scale(spv, spv);
        U.label(ctx, String(score), 0, 0, {
          font: 'bold 54px ' + U.FONT, fill: '#ffffff', stroke: 'rgba(30,58,95,.85)',
          lineWidth: 6
        });
        ctx.restore();

        if (state === 'ready') {
          U.label(ctx, '点击开始', W / 2, 330, {
            font: 'bold 24px ' + U.FONT, fill: '#ffffff', stroke: 'rgba(30,58,95,.8)'
          });
          U.label(ctx, '难度「' + lvBar.lv().name + '」· 穿过管道间隙 +1 分', W / 2, 366, {
            font: 'bold 15px ' + U.FONT, fill: 'rgba(30,58,95,.78)'
          });
        }

        if (flash > 0) {
          ctx.fillStyle = 'rgba(225,29,72,' + (flash * 0.28) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ------------------------ 主循环 ------------------------ */
      api.loop(function () {
        var now = performance.now();
        var dt = last ? (now - last) / 1000 : 1 / 60;
        last = now;
        dt = api.clamp(dt, 0, 0.05);
        t += dt;
        if (!api.isPaused()) update(dt);
        draw();
      });

      /* ------------------------ 输入 ------------------------ */
      api.onKey(function (name, e, phase) {
        if (phase !== 'down') return;
        if (name === 'space' || name === 'enter' || name === 'tap' || name === 'up') flap();
      });

      /* ------------------------ 难度（持久化） ------------------------ */
      var lvBar = api.levelBar({
        levels: LV, label: '难度', dflt: 1,
        onPick: function () { reset(); }
      });

      reset();
      api.setStatus('准备开始 · 点击起飞');
      api.hint('扇翅膀让小鸟保持高度，穿过 <b style="color:#15803d">管道间隙</b> 得 1 分；' +
        '分数越高间隙越窄。');

      return {
        destroy: function () {},
        restart: reset
      };
    }
  });
})(window.GH);
