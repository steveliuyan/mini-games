/* ===========================================================
   breakout.js — 打砖块（街机反应）
   世界坐标 480x640，挡板 + 弹性小球 + 分关卡砖墙
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'breakout',
    name: '打砖块',
    icon: '🧨',
    color: '#5b8cff',
    category: 'arcade',
    tags: ['街机', '反应', '弹球', '经典'],
    desc: '反弹小球击碎砖墙，连闯五关。',
    hint: '← → 移动挡板 · 空格发射小球',
    touch: 'dpad',
    dpad: ['left', 'right', 'space'],

    mount: function (root, api) {
      var W = 480, H = 640;
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;
      var rr = U.rr;

      var MAX_LEVEL = 5;
      var TOP = 42;                       // 顶部 HUD 高度
      var PAD_W = 92, PAD_H = 14, PAD_Y = H - 48, PAD_SPEED = 620;
      var R = 7;                          // 球半径
      var ROW_COLORS = ['#f87171', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#fb7185'];

      var bricks, paddle, paddleVis, ball, life, level, levelT, launched;
      var held, particles, trail, shake, flash, over, last;

      /* 难度：球速曲线 / 挡板速度 / 生命数 / 硬砖比例 */
      var LV = [
        { name: '轻松', v0: 230, vAdd: 24, vMax: 480, pad: 520, life: 5, hard: 0.5 },
        { name: '标准', v0: 268, vAdd: 34, vMax: 600, pad: 620, life: 3, hard: 1 },
        { name: '挑战', v0: 320, vAdd: 40, vMax: 690, pad: 700, life: 2, hard: 1.6 }
      ];

      /* ------------------------ 关卡布局 ------------------------ */
      function buildLevel() {
        bricks = [];
        var cols = 9, padX = 14, gapX = 5, bh = 22, topY = TOP + 42, gapY = 6;
        var bw = (W - padX * 2 - gapX * (cols - 1)) / cols;
        var rows = Math.min(4 + level, 7);
        var pat = (level - 1) % 3;        // 三种布局循环递进
        var mid = (cols - 1) / 2;
        var c = lvBar.lv();
        var hardRows = Math.round(rows * c.hard * 0.3);

        for (var r = 0; r < rows; r++) {
          for (var col = 0; col < cols; col++) {
            var hp = 1, keep = true;
            if (pat === 0) {                 // 实心：顶排为硬砖
              hp = r < Math.max(1, hardRows) ? 2 : 1;
            } else if (pat === 1) {          // 棋盘格
              keep = (r + col) % 2 === 0;
              hp = (r + col) % 3 === 0 ? 2 : 1;
            } else {                         // 金字塔
              keep = Math.abs(col - mid) <= Math.min(mid, r + 1.5);
              hp = r >= rows - hardRows ? 2 : 1;
            }
            if (!keep) continue;
            bricks.push({
              x: padX + col * (bw + gapX),
              y: topY + r * (bh + gapY),
              w: bw, h: bh, hp: hp, max: hp,
              color: ROW_COLORS[r % ROW_COLORS.length]
            });
          }
        }
      }

      /* ------------------------ 状态 ------------------------ */
      function reset() {
        level = 1; levelT = 0; over = false;
        life = lvBar.lv().life;
        last = 0; shake = 0; flash = 0;
        dragging = false;
        held = { left: false, right: false };
        particles = []; trail = [];
        paddle = { x: (W - PAD_W) / 2 };
        paddleVis = { x: paddle.x, squash: 0 };
        ball = { x: 0, y: 0, vx: 0, vy: 0 };
        buildLevel();
        resetBall();
        api.setScore(0);
        syncStatus();
      }

      function syncStatus() {
        var h = '';
        for (var i = 0; i < life; i++) h += '♥';
        api.setStatus('第 ' + level + ' 关 · ' + (h || '—') + ' · 砖块 ' + bricks.length);
      }

      function resetBall() {
        launched = false;
        ball.x = paddle.x + PAD_W / 2;
        ball.y = PAD_Y - R - 2;
        ball.vx = 0; ball.vy = 0;
        trail.length = 0;
      }

      function ballSpeed() {
        // 随关卡与时间递增，受难度档位上限约束
        var c = lvBar.lv();
        return Math.min(c.vMax, c.v0 + (level - 1) * c.vAdd + levelT * 2.4);
      }

      function launch() {
        if (launched || over || api.isPaused()) return;
        launched = true;
        var a = api.randFloat(-0.5, 0.5);
        var sp = ballSpeed();
        ball.vx = Math.sin(a) * sp;
        ball.vy = -Math.cos(a) * sp;
        api.audio.play('select');
      }

      function burst(x, y, color, n) {
        for (var i = 0; i < n; i++) {
          var a = Math.PI * 2 * i / n + Math.random() * 0.6;
          var sp = api.randFloat(40, 190);
          particles.push({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1, color: color
          });
        }
      }

      /* ------------------------ 碰撞 ------------------------ */
      function collideWalls() {
        if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); api.audio.play('bounce'); }
        else if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); api.audio.play('bounce'); }
        if (ball.y < TOP + R) { ball.y = TOP + R; ball.vy = Math.abs(ball.vy); api.audio.play('bounce'); }
      }

      function collidePaddle() {
        if (ball.vy <= 0) return;
        if (ball.y + R < PAD_Y || ball.y - R > PAD_Y + PAD_H) return;
        if (ball.x < paddle.x - R || ball.x > paddle.x + PAD_W + R) return;

        // 击球点越靠边，反弹角越斜（最大约 62°）
        var rel = api.clamp((ball.x - (paddle.x + PAD_W / 2)) / (PAD_W / 2), -1, 1);
        var ang = rel * 1.08;
        var sp = ballSpeed();
        ball.vx = Math.sin(ang) * sp;
        ball.vy = -Math.cos(ang) * sp;
        ball.y = PAD_Y - R - 0.5;
        api.audio.play('hit');
        burst(ball.x, ball.y, '#5b8cff', 6);
        paddleVis.squash = 1;   // 挡板受压扁回弹
      }

      function collideBricks() {
        for (var i = 0; i < bricks.length; i++) {
          var b = bricks[i];
          if (!U.circleRect(ball.x, ball.y, R, b)) continue;

          // 用重叠深度判断反弹轴
          var ox = Math.min(ball.x + R - b.x, b.x + b.w - (ball.x - R));
          var oy = Math.min(ball.y + R - b.y, b.y + b.h - (ball.y - R));
          if (ox < oy) {
            ball.vx = -ball.vx;
            ball.x += ball.vx > 0 ? ox : -ox;
          } else {
            ball.vy = -ball.vy;
            ball.y += ball.vy > 0 ? oy : -oy;
          }

          b.hp--;
          b.hitFx = 1;   // 受击白闪+抖动
          if (b.hp <= 0) {
            api.addScore(b.max > 1 ? 20 : 10);
            burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 10);
            bricks.splice(i, 1);
            api.audio.play('brick');
          } else {
            api.audio.play('tick');
            burst(ball.x, ball.y, '#ffffff', 4);
          }
          syncStatus();
          if (!bricks.length) levelClear();
          return true;
        }
        return false;
      }

      /* ------------------------ 局面推进 ------------------------ */
      function levelClear() {
        api.addScore(100 * level);
        flash = 0.7;
        api.audio.play('levelup');
        if (level >= MAX_LEVEL) {
          over = true;
          api.finish({
            win: true,
            title: '五关全清！',
            sub: '砖墙全部击碎 · 剩余生命 ' + life,
            icon: '🧨',
            metrics: { breakout_wins: 1 }
          });
          return;
        }
        level++;
        levelT = 0;
        buildLevel();
        resetBall();
        syncStatus();
      }

      function loseLife() {
        life--;
        shake = 1;
        api.audio.play('wrong');
        syncStatus();
        if (life <= 0) {
          over = true;
          api.finish({
            title: '游戏结束',
            sub: '止步第 ' + level + ' 关 · 还剩 ' + bricks.length + ' 块砖',
            icon: '💥'
          });
          return;
        }
        resetBall();
      }

      function moveBall(dt) {
        var sp = ballSpeed();
        var len = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
        ball.vx = ball.vx / len * sp;
        ball.vy = ball.vy / len * sp;

        // 分步推进，避免高速穿透
        var steps = Math.max(1, Math.ceil(sp * dt / 4));
        var sdt = dt / steps;
        for (var i = 0; i < steps; i++) {
          ball.x += ball.vx * sdt;
          ball.y += ball.vy * sdt;
          collideWalls();
          collidePaddle();
          if (collideBricks()) break;
          if (over) return;
        }
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 12) trail.shift();
        if (ball.y - R > H) loseLife();
      }

      function update(dt) {
        levelT += dt;
        var c = lvBar.lv();
        var pv = (held.left ? -1 : 0) + (held.right ? 1 : 0);
        paddle.x = api.clamp(paddle.x + pv * c.pad * dt, 0, W - PAD_W);
        // 挡板渲染平滑跟随 + 受压回弹衰减（帧率无关）
        paddleVis.x = U.damp(paddleVis.x, paddle.x, 26, dt);
        if (paddleVis.squash > 0) paddleVis.squash = Math.max(0, paddleVis.squash - dt * 5);
        // 砖块受击抖动衰减
        for (var bi = 0; bi < bricks.length; bi++) {
          if (bricks[bi].hitFx > 0) bricks[bi].hitFx = Math.max(0, bricks[bi].hitFx - dt * 6);
        }

        if (!launched) {
          ball.x = paddleVis.x + PAD_W / 2;
          ball.y = PAD_Y - R - 2;
        } else {
          moveBall(dt);
        }

        for (var i = particles.length - 1; i >= 0; i--) {
          var p = particles[i];
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy += 420 * dt; p.vx *= 0.99;
          p.life -= dt * 1.6;
          if (p.life <= 0) particles.splice(i, 1);
        }
        if (shake > 0) shake = Math.max(0, shake - dt * 3);
        if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
      }

      /* ------------------------ 绘制 ------------------------ */
      function draw() {
        var bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#f5f8fd');
        bg.addColorStop(1, '#e9eff9');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (shake > 0) ctx.translate(api.randFloat(-1, 1) * shake * 7, api.randFloat(-1, 1) * shake * 7);

        // 砖块
        for (var i = 0; i < bricks.length; i++) {
          var b = bricks[i];
          var hx = 0, hy = 0;
          if (b.hitFx > 0) {
            hx = Math.sin(b.hitFx * 40) * b.hitFx * 2.4;
            hy = Math.cos(b.hitFx * 33) * b.hitFx * 1.6;
          }
          ctx.save();
          ctx.shadowColor = api.rgba(b.color, 0.5);
          ctx.shadowBlur = b.hp > 1 ? 14 : 7;
          rr(ctx, b.x + hx, b.y + hy, b.w, b.h, 5);
          ctx.fillStyle = b.hp > 1 ? b.color : api.rgba(b.color, 0.78);
          ctx.fill();
          if (b.hitFx > 0) {   // 受击白闪
            ctx.globalAlpha = b.hitFx * 0.7;
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.restore();
          // 高光
          rr(ctx, b.x + 2, b.y + 2, b.w - 4, b.h * 0.34, 3);
          ctx.fillStyle = 'rgba(255,255,255,.22)';
          ctx.fill();
          if (b.hp > 1) {   // 硬砖裂缝提示
            ctx.strokeStyle = 'rgba(0,0,0,.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.x + b.w * 0.3, b.y + 3);
            ctx.lineTo(b.x + b.w * 0.45, b.y + b.h - 3);
            ctx.moveTo(b.x + b.w * 0.68, b.y + 3);
            ctx.lineTo(b.x + b.w * 0.55, b.y + b.h - 3);
            ctx.stroke();
          }
        }

        // 球拖尾
        for (var k = 0; k < trail.length; k++) {
          var q = trail[k];
          var a = (k + 1) / trail.length;
          ctx.fillStyle = api.rgba('#2f6bff', a * 0.30);
          ctx.beginPath();
          ctx.arc(q.x, q.y, R * a * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }

        // 挡板（平滑跟随 + 受压扁回弹）
        var px = paddleVis.x;
        var sq = paddleVis.squash;
        var ph = PAD_H * (1 - sq * 0.35);
        var pw = PAD_W * (1 + sq * 0.10);
        var pxo = px - (pw - PAD_W) / 2;
        var pyo = PAD_Y + (PAD_H - ph);
        var grad = ctx.createLinearGradient(pxo, pyo, pxo + pw, pyo + ph);
        grad.addColorStop(0, '#8fb4ff');
        grad.addColorStop(0.5, '#5b8cff');
        grad.addColorStop(1, '#3d63d6');
        ctx.save();
        ctx.shadowColor = 'rgba(47,107,255,.6)';
        ctx.shadowBlur = 18;
        rr(ctx, pxo, pyo, pw, ph, ph / 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        rr(ctx, pxo + 6, pyo + 3, pw - 12, 3, 2);
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.fill();

        // 小球
        ctx.save();
        ctx.shadowColor = 'rgba(47,107,255,.55)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#2f6bff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 粒子
        for (var p = 0; p < particles.length; p++) {
          var pt = particles[p];
          ctx.globalAlpha = Math.max(0, pt.life);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1 + 3 * pt.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // 顶部 HUD
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.fillRect(0, 0, W, TOP);
        ctx.fillStyle = 'rgba(47,107,255,.28)';
        ctx.fillRect(0, TOP - 1.5, W, 1.5);
        U.label(ctx, '第 ' + level + ' 关', 18, TOP / 2, {
          font: 'bold 18px ' + U.FONT, fill: '#2f6bff', align: 'left'
        });
        var hearts = '';
        for (var j = 0; j < life; j++) hearts += '♥ ';
        U.label(ctx, hearts.trim() || '—', W / 2, TOP / 2, {
          font: 'bold 18px ' + U.FONT, fill: '#e2415c'
        });
        U.label(ctx, '得分 ' + api.fmtNum(api.getScore()), W - 18, TOP / 2, {
          font: 'bold 18px ' + U.FONT, fill: '#131c33', align: 'right'
        });

        // 未发射提示
        if (!launched && !over) {
          U.label(ctx, '空格 / ● 发射', ball.x, PAD_Y - 42, {
            font: 'bold 16px ' + U.FONT, fill: '#131c33',
            stroke: 'rgba(255,255,255,.85)'
          });
        }

        if (flash > 0) {
          ctx.fillStyle = 'rgba(47,107,255,' + (flash * 0.18) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ------------------------ 主循环 ------------------------ */
      api.loop(function () {
        var now = performance.now();
        var dt = last ? (now - last) / 1000 : 1 / 60;
        last = now;
        dt = api.clamp(dt, 0, 0.05);     // 防切后台大跳
        if (!api.isPaused()) update(dt);
        draw();
      });

      /* ------------------------ 输入 ------------------------ */
      api.onKey(function (name, e, phase) {
        if (name === 'left') held.left = phase === 'down';
        else if (name === 'right') held.right = phase === 'down';
        else if ((name === 'space' || name === 'enter' || name === 'up') && phase === 'down') launch();
      });

      /* 触屏/鼠标：在画布上横向拖动即可带动挡板（比按虚拟键精确） */
      var dragging = false;
      function pointerToPad(clientX) {
        var r = g.canvas.getBoundingClientRect();
        if (!r.width) return;
        paddle.x = api.clamp((clientX - r.left) / r.width * W - PAD_W / 2, 0, W - PAD_W);
      }
      function onDown(e) {
        dragging = true;
        pointerToPad(e.clientX);
        if (!launched) launch();
      }
      function onMove(e) { if (dragging) pointerToPad(e.clientX); }
      function onUp() { dragging = false; }
      var offs = [
        api.on(g.canvas, 'pointerdown', onDown),
        api.on(window, 'pointermove', onMove),
        api.on(window, 'pointerup', onUp),
        api.on(window, 'pointercancel', onUp)
      ];

      /* ------------------------ 难度（持久化） ------------------------ */
      var lvBar = api.levelBar({
        levels: LV, label: '难度', dflt: 1,
        onPick: function () { reset(); }
      });

      reset();
      api.setStatus('第 1 关 · ♥♥♥ · 砖块 ' + bricks.length);
      api.hint('击球点越靠<b style="color:#2f6bff">挡板边缘</b>，反弹角越斜；硬砖需要打 <b>2</b> 次。连清 5 关触发成就。');

      return {
        destroy: function () {
          dragging = false;
          for (var i = 0; i < offs.length; i++) { if (offs[i]) offs[i](); }
          offs = [];
        },
        restart: reset
      };
    }
  });
})(window.GH);
