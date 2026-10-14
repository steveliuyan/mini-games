/* ===========================================================
   pinball.js — 弹球 / 垂直弹珠台（街机反应）
   世界坐标 420x680，重力 + 线段挡板 + 圆形缓冲柱
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'pinball',
    name: '弹球',
    icon: '🔮',
    color: '#a78bfa',
    category: 'arcade',
    tags: ['街机', '反应', '物理', '耐玩'],
    desc: '用两块挡板把弹珠打回缓冲柱，别让它落下。',
    hint: '← → 控制挡板 · 空格同时激起两块 / 发射',
    touch: 'dpad',
    dpad: ['left', 'right', 'space'],

    mount: function (root, api) {
      var W = 420, H = 680;
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;

      var GRAV = 700;          // 重力加速度 px/s²
      var R = 9;               // 弹珠半径
      var STEP = 1 / 240;      // 固定物理步长
      var MAXV = 1500;
      var BALLS = 3;

      // 台面几何
      var WALL_L = 12, WALL_R = 408;
      var LANE_X = 378;                        // 发射道左壁
      var LANE_TOP = 200, LANE_BOT = 700;
      var DOME = { cx: 210, cy: 344, r: 322 }; // 顶部圆弧（球必须留在内部）
      var DEFL = [
        { ax: WALL_L, ay: 400, bx: 128, by: 548 },   // 左侧导板
        { ax: LANE_X, ay: 400, bx: 292, by: 548 }    // 右侧导板
      ];
      var BUMPERS = [
        { x: 150, y: 236, r: 22, glow: 0 },
        { x: 270, y: 236, r: 22, glow: 0 },
        { x: 210, y: 168, r: 22, glow: 0 }
      ];
      var TARGET = { x: 210, y: 96, r: 15, cool: 0, glow: 0 };

      var ball, leftF, rightF, balls, score, state, combo, comboT, t, last;
      var acc, particles, trail, shake, flash, stuckT, readyT, power, over;
      var syncScore = -1, syncCombo = -1;

      /* ------------------------ 挡板 ------------------------ */
      function mkFlipper(px, py, len, rest, act, dir) {
        return {
          px: px, py: py, len: len, thick: 7,
          rest: rest, act: act, ang: rest, omega: 0, active: false,
          dir: dir,                          // 1: 向左展开, -1: 向右展开
          tip: { x: px, y: py }
        };
      }

      function flipperTip(f) {
        f.tip.x = f.px + f.dir * Math.cos(f.ang) * f.len;
        f.tip.y = f.py + Math.sin(f.ang) * f.len;
      }

      function updateFlipper(f, dt) {
        var target = f.active ? f.act : f.rest;
        var old = f.ang;
        var maxDelta = 16 * dt;                     // 角速度上限
        var d = target - old;
        if (d > maxDelta) d = maxDelta;
        else if (d < -maxDelta) d = -maxDelta;
        f.ang = old + d;
        f.omega = (f.ang - old) / (dt || 1 / 60);
        flipperTip(f);
      }

      /* ------------------------ 状态 ------------------------ */
      function reset() {
        leftF = mkFlipper(132, 556, 70, 30 * Math.PI / 180, -30 * Math.PI / 180, 1);
        rightF = mkFlipper(288, 556, 70, 30 * Math.PI / 180, -30 * Math.PI / 180, -1);
        flipperTip(leftF); flipperTip(rightF);

        balls = BALLS;
        score = 0;
        combo = 0; comboT = 0;
        t = 0; last = 0; acc = 0; shake = 0; flash = 0;
        stunClear();
        particles = []; trail = [];
        power = 0; readyT = 0; over = false;
        api.setScore(0);
        toReady();
        syncStatus();
      }

      function stunClear() { stuckT = 0; }

      function toReady() {
        state = 'ready';
        ball = { x: (LANE_X + WALL_R) / 2, y: 600, vx: 0, vy: 0 };
        trail.length = 0;
        stunClear();
      }

      function syncStatus() {
        api.setStatus('得分 ' + api.fmtNum(score) + ' · 弹珠 ' + balls + '/3' +
          (combo > 1 ? ' · COMBO x' + Math.min(combo, 5) : ''));
      }

      function addScore(n) {
        score += n;
        api.setScore(score);
      }

      /* ------------------------ 几何碰撞 ------------------------ */
      function reflect(nx, ny, e, svx, svy) {
        var vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= (1 + e) * vn * nx;
          ball.vy -= (1 + e) * vn * ny;
        }
        if (svx || svy) {                    // 挡板表面速度传递
          var s = svx * nx + svy * ny;
          if (s > 0) { ball.vx += s * nx * 1.05; ball.vy += s * ny * 1.05; }
        }
      }

      function segHit(ax, ay, bx, by, thick) {
        var abx = bx - ax, aby = by - ay;
        var L2 = abx * abx + aby * aby || 1;
        var tt = ((ball.x - ax) * abx + (ball.y - ay) * aby) / L2;
        tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
        var px = ax + abx * tt, py = ay + aby * tt;
        var dx = ball.x - px, dy = ball.y - py;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d > R + thick) return null;
        return { nx: dx / d, ny: dy / d, px: px, py: py, d: d };
      }

      function collide() {
        // 顶部圆弧（球保持在内部）
        if (ball.y < DOME.cy) {
          var dx = ball.x - DOME.cx, dy = ball.y - DOME.cy;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          var lim = DOME.r - R;
          if (d > lim) {
            var nx = -dx / d, ny = -dy / d;
            ball.x = DOME.cx + dx / d * lim;
            ball.y = DOME.cy + dy / d * lim;
            reflect(nx, ny, 0.45, 0, 0);
            if (Math.abs(ball.vx) + Math.abs(ball.vy) > 200) api.audio.play('bounce');
          }
        }
        // 左右外墙
        if (ball.x - R < WALL_L) { ball.x = WALL_L + R; reflect(1, 0, 0.5, 0, 0); }
        if (ball.x + R > WALL_R) { ball.x = WALL_R - R; reflect(-1, 0, 0.5, 0, 0); }
        // 发射道左壁（双侧）
        if (ball.y > LANE_TOP - R && ball.y < LANE_BOT + R && Math.abs(ball.x - LANE_X) < R) {
          if (ball.x > LANE_X) { ball.x = LANE_X + R; reflect(1, 0, 0.5, 0, 0); }
          else { ball.x = LANE_X - R; reflect(-1, 0, 0.5, 0, 0); }
        }
        // 导流板
        for (var i = 0; i < DEFL.length; i++) {
          var s = DEFL[i];
          var h = segHit(s.ax, s.ay, s.bx, s.by, 5);
          if (h) {
            ball.x += h.nx * (R + 5 - h.d);
            ball.y += h.ny * (R + 5 - h.d);
            reflect(h.nx, h.ny, 0.42, 0, 0);
          }
        }
        // 缓冲柱
        for (var b = 0; b < BUMPERS.length; b++) {
          var bp = BUMPERS[b];
          var ddx = ball.x - bp.x, ddy = ball.y - bp.y;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001;
          if (dd < R + bp.r) {
            var ux = ddx / dd, uy = ddy / dd;
            ball.x = bp.x + ux * (R + bp.r);
            ball.y = bp.y + uy * (R + bp.r);
            var vn = ball.vx * ux + ball.vy * uy;
            ball.vx -= vn * ux; ball.vy -= vn * uy;   // 去掉法向分量
            ball.vx += 400 * ux; ball.vy += 400 * uy; // 固定弹力
            bp.glow = 1;
            combo++; comboT = 1.5;
            var mult = Math.min(combo, 5);
            addScore(100 * mult);
            api.audio.play('hit');
            burst(bp.x + ux * bp.r, bp.y + uy * bp.r, '#c4b5fd', 7);
            shake = Math.max(shake, 0.35);
          }
        }
        // 顶部得分目标
        if (TARGET.cool <= 0) {
          var tx = ball.x - TARGET.x, ty = ball.y - TARGET.y;
          if (Math.sqrt(tx * tx + ty * ty) < R + TARGET.r) {
            var tn = Math.sqrt(tx * tx + ty * ty) || 0.001;
            ball.x = TARGET.x + tx / tn * (R + TARGET.r);
            ball.y = TARGET.y + ty / tn * (R + TARGET.r);
            reflect(tx / tn, ty / tn, 0.5, 0, 0);
            addScore(500);
            TARGET.cool = 4; TARGET.glow = 1;
            api.audio.play('coin');
            burst(TARGET.x, TARGET.y, '#fbbf24', 14);
            flash = 0.5;
            syncStatus();
          }
        }
        // 两块挡板
        hitFlipper(leftF);
        hitFlipper(rightF);
      }

      function hitFlipper(f) {
        var h = segHit(f.px, f.py, f.tip.x, f.tip.y, f.thick);
        if (!h) return;
        ball.x += h.nx * (R + f.thick - h.d);
        ball.y += h.ny * (R + f.thick - h.d);
        // 接触点相对转轴的速度：v = ω × r
        var rx = h.px - f.px, ry = h.py - f.py;
        var svx = -f.omega * ry, svy = f.omega * rx;
        reflect(h.nx, h.ny, 0.35, svx, svy);
      }

      function burst(x, y, color, n) {
        for (var i = 0; i < n; i++) {
          var a = Math.PI * 2 * i / n + Math.random() * 0.7;
          var sp = api.randFloat(60, 240);
          particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: color });
        }
      }

      /* ------------------------ 物理步进 ------------------------ */
      function physics(dt) {
        if (state === 'ready') {
          readyT += dt;
          power = (Math.sin(readyT * 3.6) + 1) / 2;     // 弹簧蓄力条往复
          ball.x = (LANE_X + WALL_R) / 2;
          ball.y = 600;
          return;
        }

        ball.vy += GRAV * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        var sp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (sp > MAXV) { ball.vx = ball.vx / sp * MAXV; ball.vy = ball.vy / sp * MAXV; }

        collide();

        // 卡住保护：低速滞留过久就轻推一下
        var sp2 = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (sp2 < 40 && ball.y < LANE_TOP) {
          stuckT += dt;
          if (stuckT > 1.6) {
            ball.vx += api.randFloat(-140, 140);
            ball.vy -= 90;
            stunClear();
          }
        } else stunClear();

        // 落袋
        if (ball.y > H + 30) loseBall();
      }

      function launch() {
        if (state !== 'ready' || over) return;
        state = 'play';
        ball.vy = -(880 + power * 240);
        ball.vx = 0;
        power = 0;
        api.audio.play('select');
      }

      function loseBall() {
        balls--;
        api.audio.play('lose');
        shake = 1;
        combo = 0;
        if (balls <= 0) {
          over = true;
          // 成就「弹球高手」依赖 pinball_score（存档逐键取最大值）
          api.finish({
            title: '弹珠用尽',
            sub: '总得分 ' + api.fmtNum(score),
            icon: '🔮',
            metrics: { pinball_score: score }
          });
          return;
        }
        syncStatus();
        toReady();
      }

      /* ------------------------ 更新 ------------------------ */
      function update(dt) {
        t += dt;
        updateFlipper(leftF, dt);
        updateFlipper(rightF, dt);

        // 状态行每帧最多刷新一次（缓冲柱连击会高频加分）
        if (score !== syncScore || combo !== syncCombo) {
          syncScore = score; syncCombo = combo;
          syncStatus();
        }

        acc += dt;
        var guard = 0;
        while (acc >= STEP && guard++ < 40) {
          acc -= STEP;
          physics(STEP);
          if (over) break;
        }

        if (comboT > 0) {
          comboT -= dt;
          if (comboT <= 0) { combo = 0; syncStatus(); }
        }
        if (TARGET.cool > 0) TARGET.cool -= dt;
        for (var i = 0; i < BUMPERS.length; i++) {
          if (BUMPERS[i].glow > 0) BUMPERS[i].glow = Math.max(0, BUMPERS[i].glow - dt * 1.8);
        }
        if (TARGET.glow > 0) TARGET.glow = Math.max(0, TARGET.glow - dt * 1.5);

        for (var p = particles.length - 1; p >= 0; p--) {
          var q = particles[p];
          q.x += q.vx * dt; q.y += q.vy * dt;
          q.vy += 300 * dt;
          q.life -= dt * 1.7;
          if (q.life <= 0) particles.splice(p, 1);
        }
        if (shake > 0) shake = Math.max(0, shake - dt * 2.6);
        if (flash > 0) flash = Math.max(0, flash - dt * 1.8);

        if (state === 'play') {
          trail.push({ x: ball.x, y: ball.y });
          if (trail.length > 14) trail.shift();
        }
      }

      /* ------------------------ 绘制 ------------------------ */
      function draw() {
        var bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#f1f3fc');
        bg.addColorStop(0.6, '#eaedf9');
        bg.addColorStop(1, '#f5f2fb');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (shake > 0) ctx.translate(api.randFloat(-1, 1) * shake * 6, api.randFloat(-1, 1) * shake * 6);

        // 台面顶弧
        ctx.beginPath();
        ctx.arc(DOME.cx, DOME.cy, DOME.r, Math.PI, Math.PI * 2);
        ctx.strokeStyle = 'rgba(109,77,224,.55)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(DOME.cx, DOME.cy, DOME.r - 6, Math.PI, Math.PI * 2);
        ctx.strokeStyle = 'rgba(109,77,224,.14)';
        ctx.lineWidth = 10;
        ctx.stroke();

        // 发射道
        ctx.strokeStyle = 'rgba(109,77,224,.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(LANE_X, LANE_TOP);
        ctx.lineTo(LANE_X, LANE_BOT);
        ctx.stroke();
        ctx.fillStyle = 'rgba(109,77,224,.06)';
        ctx.fillRect(LANE_X, LANE_TOP, WALL_R - LANE_X, LANE_BOT - LANE_TOP);

        // 弹簧蓄力条
        var barH = 150;
        ctx.fillStyle = 'rgba(24,38,82,.10)';
        ctx.fillRect(LANE_X + 8, 640 - barH, 8, barH);
        var grad = ctx.createLinearGradient(0, 640, 0, 640 - barH);
        grad.addColorStop(0, '#34d399');
        grad.addColorStop(0.6, '#fbbf24');
        grad.addColorStop(1, '#f43f5e');
        ctx.fillStyle = state === 'ready' ? grad : 'rgba(24,38,82,.14)';
        ctx.fillRect(LANE_X + 8, 640 - barH * (state === 'ready' ? power : 0), 8,
          barH * (state === 'ready' ? power : 0));

        // 导流板
        ctx.lineCap = 'round';
        for (var i = 0; i < DEFL.length; i++) {
          var s = DEFL[i];
          ctx.strokeStyle = 'rgba(109,77,224,.5)';
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.moveTo(s.ax, s.ay);
          ctx.lineTo(s.bx, s.by);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.75)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(s.ax, s.ay);
          ctx.lineTo(s.bx, s.by);
          ctx.stroke();
        }

        // 顶部目标
        var tOn = TARGET.cool <= 0;
        ctx.save();
        ctx.shadowColor = tOn ? 'rgba(184,118,10,.85)' : 'rgba(120,128,150,.35)';
        ctx.shadowBlur = 12 + TARGET.glow * 26;
        ctx.beginPath();
        ctx.arc(TARGET.x, TARGET.y, TARGET.r, 0, Math.PI * 2);
        ctx.fillStyle = tOn ? '#f59e0b' : 'rgba(130,138,160,.35)';
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(TARGET.x, TARGET.y, TARGET.r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = tOn ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.85)';
        ctx.fill();
        U.label(ctx, '500', TARGET.x, TARGET.y - TARGET.r - 12, {
          font: 'bold 13px ' + U.FONT, fill: tOn ? '#b8760a' : 'rgba(19,28,51,.45)'
        });

        // 缓冲柱
        for (var b = 0; b < BUMPERS.length; b++) {
          var bp = BUMPERS[b];
          var gl = bp.glow;
          ctx.save();
          ctx.shadowColor = 'rgba(109,77,224,.95)';
          ctx.shadowBlur = 14 + gl * 30;
          var bg2 = ctx.createRadialGradient(bp.x - 6, bp.y - 8, 2, bp.x, bp.y, bp.r);
          bg2.addColorStop(0, gl > 0 ? '#ffffff' : '#d9cdfb');
          bg2.addColorStop(1, '#6d4de0');
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.r + gl * 3, 0, Math.PI * 2);
          ctx.fillStyle = bg2;
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.r * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.fill();
        }

        // 挡板
        drawFlipper(leftF);
        drawFlipper(rightF);

        // 拖尾 + 弹珠
        for (var k = 0; k < trail.length; k++) {
          var q2 = trail[k];
          var a = (k + 1) / trail.length;
          ctx.fillStyle = api.rgba('#7c5cf0', a * 0.28);
          ctx.beginPath();
          ctx.arc(q2.x, q2.y, R * a * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.shadowColor = 'rgba(109,77,224,.6)';
        ctx.shadowBlur = 16;
        var bg3 = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, R);
        bg3.addColorStop(0, '#ffffff');
        bg3.addColorStop(1, '#6d4de0');
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fillStyle = bg3;
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

        // COMBO 提示
        if (combo > 1) {
          U.label(ctx, 'COMBO x' + Math.min(combo, 5), W / 2, 470, {
            font: 'bold 22px ' + U.FONT, fill: '#6d4de0', stroke: 'rgba(255,255,255,.88)'
          });
        }
        // 剩余弹珠
        for (var j = 0; j < balls; j++) {
          ctx.beginPath();
          ctx.arc(WALL_L + 14 + j * 20, 30, 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(109,77,224,.85)';
          ctx.fill();
        }
        if (state === 'ready' && !over) {
          U.label(ctx, '空格 / ● 发射', LANE_X - 10, 540, {
            font: 'bold 15px ' + U.FONT, fill: '#131c33',
            stroke: 'rgba(255,255,255,.85)', align: 'right'
          });
        }
        if (flash > 0) {
          ctx.fillStyle = 'rgba(184,118,10,' + (flash * 0.22) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      function drawFlipper(f) {
        ctx.save();
        ctx.shadowColor = f.active ? 'rgba(217,61,89,.55)' : 'rgba(109,77,224,.45)';
        ctx.shadowBlur = f.active ? 20 : 10;
        ctx.strokeStyle = f.active ? '#e2415c' : '#6d4de0';
        ctx.lineWidth = f.thick * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.px, f.py);
        ctx.lineTo(f.tip.x, f.tip.y);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(f.px, f.py);
        ctx.lineTo(f.tip.x, f.tip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.px, f.py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#6d4de0';
        ctx.fill();
      }

      /* ------------------------ 主循环 ------------------------ */
      api.loop(function () {
        var now = performance.now();
        var dt = last ? (now - last) / 1000 : 1 / 60;
        last = now;
        dt = api.clamp(dt, 0, 0.05);
        if (!api.isPaused()) update(dt);
        draw();
      });

      /* ------------------------ 输入 ------------------------ */
      api.onKey(function (name, e, phase) {
        var down = phase === 'down';
        if (name === 'left') leftF.active = down;
        else if (name === 'right') rightF.active = down;
        else if (name === 'space') {
          leftF.active = down; rightF.active = down;
          if (down) launch();
        } else if (name === 'up' || name === 'enter') {
          if (down) launch();
        }
      });

      reset();
      api.setStatus('得分 0 · 弹珠 3/3');
      api.hint('按住 <b style="color:#d93d59">←</b> / <b style="color:#d93d59">→</b> 抬起挡板；' +
        '撞缓冲柱有连击加成，顶部金色目标 <b>+500</b>。');

      return {
        destroy: function () {},
        restart: reset
      };
    }
  });
})(window.GH);
