/* ===========================================================
   dodger.js — 躲避障碍（街机反应）
   世界坐标 400x640，飞船横向移动躲避下落的陨石/横梁
   =========================================================== */
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'dodger',
    name: '躲避障碍',
    icon: '🚀',
    color: '#f43f5e',
    category: 'arcade',
    tags: ['街机', '反应', '躲避', '耐玩'],
    desc: '操控飞船躲开陨石雨，活得越久越好。',
    hint: '← → / 滑动 移动飞船',
    touch: 'dpad',
    dpad: ['left', 'right'],

    mount: function (root, api) {
      var W = 400, H = 640;
      var g = api.canvas({ w: W, h: H });
      var ctx = g.ctx;
      var rr = U.rr;

      var SHIP_Y = H - 74, SHIP_R = 13;
      var HOLD_SPEED = 360, STEP = 26, LERP_RATE = 20;

      /* 难度：下落速度曲线 / 生成间隔下限 / 横梁缺口 */
      var LV = [
        { name: '轻松', v0: 100, vK: 5.0, vMax: 270, g0: 0.98, gMin: 0.5, gap0: 168, gapMin: 145 },
        { name: '标准', v0: 118, vK: 6.5, vMax: 330, g0: 0.86, gMin: 0.38, gap0: 152, gapMin: 128 },
        { name: '挑战', v0: 142, vK: 8.2, vMax: 420, g0: 0.72, gMin: 0.3, gap0: 138, gapMin: 112 }
      ];

      var ship, targetX, held, obs, items, stars, flames, popups, boom;
      var elapsed, scoreShown, ptsAcc, shieldT, slowT, spawnT, barT;
      var alive, flash, shake, t, last, dieReported;

      function reset() {
        ship = { x: W / 2, y: SHIP_Y };
        targetX = W / 2;
        held = { left: false, right: false, prevL: false, prevR: false };
        obs = []; items = []; flames = []; popups = [];
        stars = [];
        for (var i = 0; i < 70; i++) {
          stars.push({
            x: api.randFloat(0, W), y: api.randFloat(0, H),
            r: api.randFloat(0.6, 1.9), v: api.randFloat(22, 95)
          });
        }
        elapsed = 0; scoreShown = 0; ptsAcc = 0;
        shieldT = 0; slowT = 0; spawnT = 0.7; barT = 9;
        alive = true; flash = 0; shake = 0; boom = 0; dieReported = false;
        t = 0; last = 0;
        dragging = false;
        api.setScore(0);
        api.setStatus('存活 0 秒 · 得分 0');
      }

      /* ------------------------ 难度曲线 ------------------------ */
      function fallSpeed() {
        var c = lvBar.lv();
        return Math.min(c.vMax, c.v0 + elapsed * c.vK);
      }
      function spawnGap() {
        var c = lvBar.lv();
        return Math.max(c.gMin, c.g0 - elapsed * 0.009);
      }

      function spawnObstacle() {
        // 12 秒后开始出现带缺口的横梁
        if (elapsed > 12 && barT <= 0 && api.chance(0.16)) {
          barT = api.randFloat(6, 9);
          var gw = Math.max(128, 152 - elapsed * 0.4);
          obs.push({
            kind: 'bar', y: -30, h: 26, gapW: gw,
            gapX: api.randFloat(14, W - gw - 14),
            vy: fallSpeed() * 0.82, scored: false, rot: 0
          });
          return;
        }
        var r = api.randFloat(10, 12 + Math.min(11, elapsed * 0.34));
        obs.push({
          kind: 'rock', x: api.randFloat(r + 10, W - r - 10), y: -r - 10,
          r: r, vy: fallSpeed() * api.randFloat(0.9, 1.15),
          rot: api.randFloat(0, 6.28), spin: api.randFloat(-2.4, 2.4),
          scored: false, seed: api.randFloat(0, 100)
        });
      }

      function spawnItem() {
        var kind = api.chance(0.5) ? 'shield' : 'slow';
        items.push({
          kind: kind, x: api.randFloat(34, W - 34), y: -24,
          vy: fallSpeed() * 0.7, spin: 0
        });
      }

      function popup(x, y, text, color) {
        popups.push({ x: x, y: y, text: text, color: color, life: 1 });
      }

      /* ------------------------ 得分 ------------------------ */
      function syncStatus() {
        api.setStatus('存活 ' + Math.floor(elapsed) + ' 秒 · 得分 ' + api.fmtNum(api.getScore()) +
          (shieldT > 0 ? ' · 🛡 护盾' : '') + (slowT > 0 ? ' · ⏳ 减速' : ''));
      }

      /* ------------------------ 碰撞 ------------------------ */
      function hit() {
        if (shieldT > 0) {            // 护盾抵挡一次，撞击后消失
          shieldT = 0;
          shake = 1;
          api.audio.play('hit');
          flash = 0.6;
          popup(ship.x, ship.y - 36, '护盾抵消', '#0369a1');
          syncStatus();
          return true;                // 已消耗，不算失败
        }
        die();
        return false;
      }

      function die() {
        if (!alive) return;
        alive = false;
        boom = 1;
        flash = 1;
        shake = 1;
        api.audio.play('explode');
        for (var i = 0; i < 26; i++) {
          var a = Math.PI * 2 * i / 26;
          var sp = api.randFloat(60, 300);
          flames.push({
            x: ship.x, y: ship.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1, size: api.randFloat(2, 5)
          });
        }
        for (var i = 0; i < 26; i++) {
          var a = Math.PI * 2 * i / 26;
          var sp = api.randFloat(60, 300);
          flames.push({
            x: ship.x, y: ship.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1, size: api.randFloat(2, 5)
          });
        }
        // 坠毁演出：爆炸+慢镜头 0.9s 后再弹结算
        api.timeout(function () {
          if (dieReported || api.isFinished()) return;
          dieReported = true;
          api.finish({
            title: '飞船坠毁',
            sub: '存活 ' + Math.floor(elapsed) + ' 秒 · 难度「' + lvBar.lv().name + '」',
            icon: '💥',
            metrics: { dodger_time: Math.floor(elapsed) }
          });
        }, 900);
      }

      /* ------------------------ 更新 ------------------------ */
      function update(dt) {
        var timeScale = slowT > 0 ? 0.5 : 1;
        var dts = dt * timeScale;         // 减速时整体时间放慢

        if (alive) {
          elapsed += dt;                  // 计时按真实时间

          // 移动：进入方向键瞬间给一次位移脉冲，长按则持续加速
          var edgeL = held.left && !held.prevL;
          var edgeR = held.right && !held.prevR;
          held.prevL = held.left; held.prevR = held.right;
          if (edgeL && !edgeR) targetX -= STEP;
          if (edgeR && !edgeL) targetX += STEP;
          var dir = (held.left ? -1 : 0) + (held.right ? 1 : 0);
          if (dir) targetX += dir * HOLD_SPEED * dt;
          targetX = api.clamp(targetX, SHIP_R + 12, W - SHIP_R - 12);
          ship.x = api.lerp(ship.x, targetX, 1 - Math.exp(-LERP_RATE * dt));

          // 存活计分：每秒 10 分（整数累加，避免被 setScore 取整吃掉）
          ptsAcc += 10 * dt;
          while (ptsAcc >= 1) { ptsAcc -= 1; api.addScore(1); }
          var fl = Math.floor(elapsed);
          if (fl !== scoreShown) { scoreShown = fl; syncStatus(); }

          // 生成
          spawnT -= dts;
          if (spawnT <= 0) { spawnT = spawnGap(); spawnObstacle(); }
          if (barT > 0) barT -= dts;
          if (api.chance(dt * 0.11) && items.length < 2) spawnItem();

          if (shieldT > 0) shieldT = Math.max(0, shieldT - dt);
          if (slowT > 0) { slowT = Math.max(0, slowT - dt); if (slowT === 0) syncStatus(); }
        }

        // 障碍推进
        for (var i = obs.length - 1; i >= 0; i--) {
          var o = obs[i];
          o.y += o.vy * dts;
          if (o.kind === 'rock') o.rot += o.spin * dts;

          if (alive && !o.scored && o.y > ship.y - SHIP_R) {
            o.scored = true;
            // 擦身而过额外加分
            if (o.kind === 'rock') {
              var gap = Math.abs(o.x - ship.x) - o.r - SHIP_R;
              if (gap < 26) { api.addScore(10); popup(ship.x, ship.y - 30, '擦身 +10', '#b8760a'); api.audio.play('tick'); }
            }
          }

          if (alive && collideObs(o)) {
            obs.splice(i, 1);
            if (!hit()) return;
            continue;
          }
          if (o.y > H + 60) obs.splice(i, 1);
        }

        // 道具
        for (var j = items.length - 1; j >= 0; j--) {
          var it = items[j];
          it.y += it.vy * dts;
          it.spin += dts * 2.4;
          var d = api.dist(it.x, it.y, ship.x, ship.y);
          if (alive && d < SHIP_R + 15) {
            if (it.kind === 'shield') { shieldT = 5; popup(ship.x, ship.y - 34, '护盾 5s', '#0369a1'); }
            else { slowT = 4; popup(ship.x, ship.y - 34, '减速 4s', '#047857'); }
            api.audio.play('coin');
            api.addScore(50);
            syncStatus();
            items.splice(j, 1);
            continue;
          }
          if (it.y > H + 40) items.splice(j, 1);
        }

        // 星空
        for (var s = 0; s < stars.length; s++) {
          var st = stars[s];
          st.y += st.v * dts;
          if (st.y > H) { st.y = -2; st.x = api.randFloat(0, W); }
        }

        // 引擎尾焰
        if (alive && api.chance(dt * 60)) {
          flames.push({
            x: ship.x + api.randFloat(-4, 4), y: ship.y + 14,
            vx: api.randFloat(-26, 26), vy: api.randFloat(120, 230),
            life: 1, size: api.randFloat(1.5, 3.4)
          });
        }
        for (var f = flames.length - 1; f >= 0; f--) {
          var fm = flames[f];
          fm.x += fm.vx * dt; fm.y += fm.vy * dt;
          fm.vy += 60 * dt;
          fm.life -= dt * 1.9;
          if (fm.life <= 0) flames.splice(f, 1);
        }

        for (var p = popups.length - 1; p >= 0; p--) {
          popups[p].y -= dt * 34;
          popups[p].life -= dt * 1.2;
          if (popups[p].life <= 0) popups.splice(p, 1);
        }

        if (boom > 0) boom = Math.max(0, boom - dt * 1.4);
        if (flash > 0) flash = Math.max(0, flash - dt * 1.7);
        if (shake > 0) shake = Math.max(0, shake - dt * 2.8);
      }

      function collideObs(o) {
        if (o.kind === 'rock') return api.dist(o.x, o.y, ship.x, ship.y) < o.r + SHIP_R;
        // 横梁：左右两段
        var left = { x: 0, y: o.y, w: o.gapX, h: o.h };
        var right = { x: o.gapX + o.gapW, y: o.y, w: W - o.gapX - o.gapW, h: o.h };
        return U.circleRect(ship.x, ship.y, SHIP_R, left) ||
          U.circleRect(ship.x, ship.y, SHIP_R, right);
      }

      /* ------------------------ 绘制 ------------------------ */
      function drawShip() {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        var tilt = api.clamp((held.right ? 1 : 0) - (held.left ? 1 : 0), -1, 1) * 0.24;
        ctx.rotate(tilt);

        // 护盾光罩
        if (shieldT > 0) {
          ctx.beginPath();
          ctx.arc(0, 0, SHIP_R + 9 + Math.sin(t * 8) * 1.6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(2,132,199,' + (0.5 + 0.35 * Math.sin(t * 8)) + ')';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.fillStyle = 'rgba(2,132,199,.10)';
          ctx.fill();
        }

        ctx.shadowColor = 'rgba(244,63,94,.45)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(11, 8);
        ctx.lineTo(0, 3);
        ctx.lineTo(-11, 8);
        ctx.closePath();
        ctx.fillStyle = '#ffa3b5';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(5, 6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.shadowBlur = 0;

        // 座舱
        ctx.beginPath();
        ctx.arc(0, -6, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#bae6fd';
        ctx.fill();

        // 机翼
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.moveTo(-11, 4); ctx.lineTo(-19, 12); ctx.lineTo(-6, 10);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(11, 4); ctx.lineTo(19, 12); ctx.lineTo(6, 10);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      function draw() {
        // 浅色天幕背景
        var bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#eef2fb');
        bg.addColorStop(0.7, '#e4ebf8');
        bg.addColorStop(1, '#f2e9f4');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (shake > 0) ctx.translate(api.randFloat(-1, 1) * shake * 8, api.randFloat(-1, 1) * shake * 8);

        // 星空
        for (var s = 0; s < stars.length; s++) {
          var st = stars[s];
          ctx.globalAlpha = 0.20 + (st.r / 1.9) * 0.5;
          ctx.fillStyle = st.r > 1.5 ? '#2f6bff' : '#6e7b96';
          ctx.fillRect(st.x, st.y, st.r, st.r);
        }
        ctx.globalAlpha = 1;

        // 障碍
        for (var i = 0; i < obs.length; i++) {
          var o = obs[i];
          if (o.kind === 'rock') {
            ctx.save();
            ctx.translate(o.x, o.y);
            ctx.rotate(o.rot);
            ctx.shadowColor = 'rgba(225,29,72,.35)';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(0, 0, o.r, 0, Math.PI * 2);
            ctx.fillStyle = '#c2415f';
            ctx.fill();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.3, o.r * 0.72, 0, Math.PI * 2);
            ctx.fillStyle = '#dd6480';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(o.x + o.r * 0.3, o.y + o.r * 0.25, o.r * 0.22, 0, Math.PI * 2);
            ctx.arc(o.x - o.r * 0.35, o.y + o.r * 0.2, o.r * 0.16, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(90,20,40,.32)';
            ctx.fill();
          } else {
            var grd = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
            grd.addColorStop(0, '#fda4af');
            grd.addColorStop(0.5, '#f43f5e');
            grd.addColorStop(1, '#9f1239');
            ctx.fillStyle = grd;
            rr(ctx, -6, o.y, o.gapX + 6, o.h, 6); ctx.fill();
            rr(ctx, o.gapX + o.gapW, o.y, W - o.gapX - o.gapW + 6, o.h, 6); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.fillRect(0, o.y + 4, o.gapX, 2);
            ctx.fillRect(o.gapX + o.gapW, o.y + 4, W - o.gapX - o.gapW, 2);
          }
        }

        // 道具
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          var col = it.kind === 'shield' ? '#38bdf8' : '#34d399';
          ctx.save();
          ctx.translate(it.x, it.y);
          ctx.rotate(Math.sin(it.spin) * 0.4);
          ctx.shadowColor = api.rgba(col, 0.9);
          ctx.shadowBlur = 16;
          rr(ctx, -13, -13, 26, 26, 7);
          ctx.fillStyle = api.rgba(col, 0.9);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 15px ' + U.FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(it.kind === 'shield' ? '🛡' : '⏳', it.x, it.y + 1);
          ctx.textAlign = 'start';
        }

        // 尾焰
        for (var f = 0; f < flames.length; f++) {
          var fm = flames[f];
          ctx.globalAlpha = Math.max(0, fm.life);
          ctx.fillStyle = fm.vy < 0 ? '#fbbf24' : '#fb7185';
          ctx.beginPath();
          ctx.arc(fm.x, fm.y, fm.size * fm.life + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (alive) drawShip();

        // 飘字
        for (var p = 0; p < popups.length; p++) {
          var pu = popups[p];
          ctx.globalAlpha = Math.max(0, pu.life);
          U.label(ctx, pu.text, pu.x, pu.y, {
            font: 'bold 15px ' + U.FONT, fill: pu.color, stroke: 'rgba(255,255,255,.88)'
          });
        }
        ctx.globalAlpha = 1;

        ctx.restore();

        // HUD
        U.label(ctx, api.fmtClock(elapsed), W / 2, 34, {
          font: 'bold 26px ' + U.FONT, fill: '#131c33', stroke: 'rgba(255,255,255,.88)'
        });
        U.label(ctx, '得分 ' + api.fmtNum(api.getScore()), W / 2, 60, {
          font: 'bold 14px ' + U.FONT, fill: 'rgba(19,28,51,.62)'
        });

        if (flash > 0) {
          ctx.fillStyle = 'rgba(47,107,255,' + (flash * 0.22) + ')';
          ctx.fillRect(0, 0, W, H);
        }
        if (boom > 0) {
          ctx.fillStyle = 'rgba(244,63,94,' + (boom * 0.22) + ')';
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
        if (name === 'left') held.left = phase === 'down';
        else if (name === 'right') held.right = phase === 'down';
      });

      /* 触屏/鼠标：直接在画布上横向拖动来操控飞船（比按方向键精确得多） */
      var dragging = false;
      function pointerToX(clientX) {
        var r = g.canvas.getBoundingClientRect();
        if (!r.width) return targetX;
        return api.clamp((clientX - r.left) / r.width * W, SHIP_R + 12, W - SHIP_R - 12);
      }
      function onDown(e) {
        if (!alive) return;
        dragging = true;
        targetX = pointerToX(e.clientX);
      }
      function onMove(e) {
        if (!dragging) return;
        targetX = pointerToX(e.clientX);
      }
      function onUp() { dragging = false; }
      // api.on 不做自动回收，自己记账，销毁时解绑
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
      api.setStatus('存活 0 秒 · 得分 0');
      api.hint('每存活 <b>1 秒 +10</b> 分，擦身而过 <b>+10</b>；触屏可直接<b>拖动飞船</b>。');

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
