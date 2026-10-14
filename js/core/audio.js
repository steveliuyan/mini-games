/* ===========================================================
   audio.js — Web Audio 合成音效引擎（零资源文件，纯代码发声）
   =========================================================== */
(function (GH) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* 基础振荡器音。o: {f, to, dur, type, gain, delay, attack} */
  function tone(o) {
    if (!enabled) return;
    if (!ensureCtx()) return;
    var t0 = now() + (o.delay || 0);
    var dur = o.dur || 0.12;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.to && o.to !== o.f) {
      if (o.exp === false) osc.frequency.linearRampToValueAtTime(o.to, t0 + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    }
    var vol = o.gain == null ? 0.16 : o.gain;
    var atk = o.attack == null ? 0.006 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* 噪声（打击 / 爆炸） */
  var noiseBuf = null;
  function noise(o) {
    if (!enabled) return;
    if (!ensureCtx()) return;
    if (!noiseBuf) {
      var len = Math.floor(ctx.sampleRate * 0.6);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = now() + (o.delay || 0);
    var dur = o.dur || 0.16;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var flt = ctx.createBiquadFilter();
    flt.type = o.filter || 'lowpass';
    flt.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.to) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
    var g = ctx.createGain();
    var vol = o.gain == null ? 0.16 : o.gain;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* 短促和弦 */
  function chord(freqs, dur, type, gain, delay) {
    freqs.forEach(function (f, i) {
      tone({ f: f, dur: dur, type: type || 'triangle', gain: gain || 0.11, delay: (delay || 0) + i * 0.045 });
    });
  }

  /* ------------------------ 音效库 ------------------------ */
  var Bank = {
    click:  function () { tone({ f: 620, to: 880, dur: 0.055, type: 'square', gain: 0.07 }); },
    move:   function () { tone({ f: 340, to: 420, dur: 0.04, type: 'square', gain: 0.045 }); },
    select: function () { tone({ f: 520, to: 780, dur: 0.08, type: 'triangle', gain: 0.1 }); },
    eat:    function () { tone({ f: 660, to: 1180, dur: 0.1, type: 'triangle', gain: 0.13 }); },
    score:  function () { tone({ f: 780, to: 1240, dur: 0.11, type: 'triangle', gain: 0.12 }); },
    tick:   function () { tone({ f: 1200, dur: 0.025, type: 'square', gain: 0.05 }); },
    coin:   function () { tone({ f: 988, dur: 0.07, type: 'square', gain: 0.09 }); tone({ f: 1319, dur: 0.13, type: 'square', gain: 0.08, delay: 0.07 }); },
    drop:   function () { tone({ f: 300, to: 150, dur: 0.1, type: 'sine', gain: 0.11 }); },
    flip:   function () { tone({ f: 900, to: 1500, dur: 0.05, type: 'sine', gain: 0.07 }); },
    correct:function () { chord([523, 659, 784], 0.14, 'triangle', 0.1); },
    wrong:  function () { tone({ f: 220, to: 110, dur: 0.26, type: 'sawtooth', gain: 0.1 }); },
    hit:    function () { noise({ f: 1600, to: 300, dur: 0.11, gain: 0.14 }); },
    bounce: function () { tone({ f: 480, to: 720, dur: 0.055, type: 'square', gain: 0.09 }); },
    brick:  function () { tone({ f: 880, to: 1500, dur: 0.07, type: 'square', gain: 0.1 }); },
    explode:function () { noise({ f: 900, to: 80, dur: 0.34, gain: 0.19 }); },
    flap:   function () { tone({ f: 420, to: 700, dur: 0.07, type: 'triangle', gain: 0.1 }); },
    line:   function () { chord([659, 880, 1175], 0.13, 'square', 0.085); },
    levelup:function () { chord([523, 659, 784, 1047], 0.18, 'triangle', 0.1); },
    win:    function () { chord([523, 659, 784, 1047, 1319], 0.26, 'triangle', 0.11); },
    lose:   function () { chord([392, 330, 262, 196], 0.22, 'sawtooth', 0.075); },
    unlock: function () { chord([784, 1047, 1319, 1568], 0.2, 'sine', 0.1); }
  };

  GH.Audio = {
    play: function (name) {
      var fn = Bank[name];
      if (fn) { try { fn(); } catch (e) { /* 音频非关键路径 */ } }
    },
    /* 首次用户手势时调用，解锁 AudioContext */
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      var c = ensureCtx();
      if (c && c.state === 'suspended') c.resume();
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (master) master.gain.value = enabled ? 0.5 : 0;
      if (enabled) GH.Audio.unlock();
    },
    isEnabled: function () { return enabled; },
    /* 供游戏自定义音色 */
    tone: tone,
    noise: noise
  };
})(window.GH);
