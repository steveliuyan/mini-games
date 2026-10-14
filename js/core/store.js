/* ===========================================================
   store.js — 本地存档层（localStorage）
   记录：最高分 / 游玩次数 / 全局统计 / 成就 / 设置
   =========================================================== */
(function (GH) {
  'use strict';

  var KEY = 'gamehub.save.v1';
  var cache = null;

  function blank() {
    return {
      version: 1,
      created: Date.now(),
      scores: {},       // { gameId: bestScore }
      plays: {},        // { gameId: finishedCount }
      stats: {          // 全局统计
        plays: 0,       // 总完成的局数
        seconds: 0,     // 累计游玩时长（秒）
        wins: 0,        // 通关/获胜次数
        maxScore: 0,    // 全局单局最高分
        sessions: 0     // 大厅打开次数
      },
      metrics: {},      // { 任意游戏上报的数值指标: 取最大值 }
      unlocked: [],     // 已解锁成就 id
      settings: { sound: true }
    };
  }

  function load() {
    if (cache) return cache;
    var data = blank();
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          data.created = p.created || data.created;
          data.scores = p.scores || {};
          data.plays = p.plays || {};
          data.stats = Object.assign(data.stats, p.stats || {});
          data.metrics = p.metrics || {};
          data.unlocked = Array.isArray(p.unlocked) ? p.unlocked : [];
          data.settings = Object.assign(data.settings, p.settings || {});
        }
      } catch (e) {
        console.warn('[store] 存档解析失败，使用全新存档', e);
      }
    }
    cache = data;
    return cache;
  }

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(load()));
      return true;
    } catch (e) {
      console.warn('[store] 存档写入失败（可能是隐私模式）', e);
      return false;
    }
  }

  var Store = {
    /* ---------- 读取 ---------- */
    all: load,
    getBest: function (id) { return load().scores[id] || 0; },
    getPlays: function (id) { return load().plays[id] || 0; },
    getMetric: function (key) { return load().metrics[key] || 0; },
    getStats: function () { return load().stats; },
    isAvailable: function () {
      try {
        window.localStorage.setItem('gamehub.probe', '1');
        window.localStorage.removeItem('gamehub.probe');
        return true;
      } catch (e) { return false; }
    },

    /* ---------- 设置 ---------- */
    getSetting: function (key, dflt) {
      var s = load().settings;
      return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : dflt;
    },
    setSetting: function (key, value) {
      load().settings[key] = value;
      persist();
      GH.bus.emit('setting', key, value);
    },

    /* ---------- 成绩提交 ---------- */
    /* 返回 { best, isNew, prev, plays } */
    submit: function (gameId, score, opts) {
      opts = opts || {};
      var d = load();
      score = Math.max(0, Math.round(Number(score) || 0));
      var prev = d.scores[gameId] || 0;
      var isNew = score > prev;

      d.plays[gameId] = (d.plays[gameId] || 0) + 1;
      d.stats.plays += 1;
      if (isNew) d.scores[gameId] = score;
      if (score > d.stats.maxScore) d.stats.maxScore = score;

      var won = !!opts.win;
      if (won) d.stats.wins += 1;

      var secs = Math.max(0, Math.round(Number(opts.seconds) || 0));
      if (secs) d.stats.seconds += secs;

      // 游戏自定义指标：默认取最大值
      var m = opts.metrics;
      if (m) {
        Object.keys(m).forEach(function (k) {
          var v = Number(m[k]) || 0;
          if (!d.metrics[k] || v > d.metrics[k]) d.metrics[k] = v;
        });
      }

      persist();
      GH.bus.emit('submit', gameId, score, { isNew: isNew, prev: prev, win: won });
      return { best: d.scores[gameId] || 0, isNew: isNew, prev: prev, plays: d.plays[gameId] };
    },

    /* ---------- 成就 ---------- */
    isUnlocked: function (id) { return load().unlocked.indexOf(id) > -1; },
    unlock: function (id) {
      var d = load();
      if (d.unlocked.indexOf(id) > -1) return false;
      d.unlocked.push(id);
      persist();
      GH.bus.emit('achievement', id);
      return true;
    },

    /* ---------- 会话 ---------- */
    markSession: function () {
      var d = load();
      d.stats.sessions += 1;
      persist();
    },

    /* ---------- 维护 ---------- */
    reset: function () {
      cache = blank();
      cache.stats.sessions = 1;
      persist();
      GH.bus.emit('reset');
    },

    exportJSON: function () {
      return JSON.stringify(load(), null, 2);
    },

    importJSON: function (text) {
      var p = JSON.parse(text);
      if (!p || typeof p !== 'object') throw new Error('存档格式不正确');
      if (!p.scores && !p.stats) throw new Error('存档缺少必要字段');
      var d = blank();
      d.created = p.created || d.created;
      d.scores = p.scores || {};
      d.plays = p.plays || {};
      d.stats = Object.assign(d.stats, p.stats || {});
      d.metrics = p.metrics || {};
      d.unlocked = Array.isArray(p.unlocked) ? p.unlocked : [];
      d.settings = Object.assign(d.settings, p.settings || {});
      cache = d;
      persist();
      GH.bus.emit('reset');
      return true;
    }
  };

  GH.Store = Store;
})(window.GH);
