/* ===========================================================
   achievements.js — 成就系统
   每局结束后统一评估；条件基于已持久化的存档与游戏上报的指标。
   =========================================================== */
(function (GH) {
  'use strict';

  /* ctx 结构：
     { scores:{}, plays:{}, stats:{plays,seconds,wins,maxScore}, metrics:{}, unlocked:[] } */
  var LIST = [
    { id: 'first_play',  icon: '🌱', name: '初来乍到',   desc: '完成第一局游戏',
      test: function (c) { return c.stats.plays >= 1; } },
    { id: 'plays_10',    icon: '🔥', name: '渐入佳境',   desc: '累计完成 10 局游戏',
      test: function (c) { return c.stats.plays >= 10; } },
    { id: 'plays_50',    icon: '💪', name: '老玩家',     desc: '累计完成 50 局游戏',
      test: function (c) { return c.stats.plays >= 50; } },
    { id: 'plays_150',   icon: '🏛️', name: '常驻居民',   desc: '累计完成 150 局游戏',
      test: function (c) { return c.stats.plays >= 150; } },
    { id: 'time_1h',     icon: '⏳', name: '时光飞逝',   desc: '累计游玩满 1 小时',
      test: function (c) { return c.stats.seconds >= 3600; } },

    { id: 'explorer_4',  icon: '🧭', name: '浅尝辄止',   desc: '玩过 4 款不同游戏',
      test: function (c) { return Object.keys(c.plays).length >= 4; } },
    { id: 'explorer_8',  icon: '🗺️', name: '广泛涉猎',   desc: '玩过 8 款不同游戏',
      test: function (c) { return Object.keys(c.plays).length >= 8; } },
    { id: 'explorer_all',icon: '👑', name: '全制霸',     desc: '玩过全部 16 款游戏',
      test: function (c) { return Object.keys(c.plays).length >= 16; } },

    { id: 'score_1k',    icon: '🎯', name: '千分俱乐部', desc: '任意游戏单局得分 ≥ 1000',
      test: function (c) { return c.stats.maxScore >= 1000; } },
    { id: 'score_5k',    icon: '💎', name: '五千分',     desc: '任意游戏单局得分 ≥ 5000',
      test: function (c) { return c.stats.maxScore >= 5000; } },

    { id: 'snake_30',    icon: '🐍', name: '长虫一条',   desc: '贪吃蛇单局得分 ≥ 300',
      test: function (c) { return (c.scores.snake || 0) >= 300; } },
    { id: 'tetris_10',   icon: '🧱', name: '方块大师',   desc: '俄罗斯方块单局消除 ≥ 10 行',
      test: function (c) { return (c.metrics.tetris_lines || 0) >= 10; } },
    { id: 'g2048_win',   icon: '🔢', name: '2048 达成',  desc: '在 2048 中合成出 2048',
      test: function (c) { return (c.metrics.g2048_max || 0) >= 2048; } },
    { id: 'mine_win',    icon: '🚩', name: '扫雷专家',   desc: '通关一局初级扫雷',
      test: function (c) { return (c.metrics.mine_wins || 0) >= 1; } },

    { id: 'memory_perfect', icon: '🧠', name: '过目不忘', desc: '记忆翻牌零失误通关',
      test: function (c) { return (c.metrics.memory_perfect || 0) >= 1; } },
    { id: 'sudoku_win',  icon: '📐', name: '数独终结者', desc: '完成一局数独',
      test: function (c) { return (c.metrics.sudoku_wins || 0) >= 1; } },
    { id: 'sokoban_win', icon: '📦', name: '搬运工',     desc: '通关推箱子任意关卡',
      test: function (c) { return (c.metrics.sokoban_wins || 0) >= 1; } },
    { id: 'klotski_win', icon: '🐎', name: '曹操出逃',   desc: '通关华容道（横刀立马）',
      test: function (c) { return (c.metrics.klotski_wins || 0) >= 1; } },

    { id: 'gomoku_win',  icon: '⚫', name: '五子连珠',   desc: '战胜五子棋 AI',
      test: function (c) { return (c.metrics.gomoku_wins || 0) >= 1; } },
    { id: 'ttt_win',     icon: '❌', name: '棋逢对手',   desc: '战胜井字棋 AI',
      test: function (c) { return (c.metrics.ttt_wins || 0) >= 1; } },
    { id: 'reversi_win', icon: '⚪', name: '黑白翻盘',   desc: '战胜黑白棋 AI',
      test: function (c) { return (c.metrics.reversi_wins || 0) >= 1; } },
    { id: 'guess_3',     icon: '🔍', name: '神机妙算',   desc: '3 次以内猜中数字',
      test: function (c) { return (c.metrics.guess_best || 0) >= 1 && (c.metrics.guess_best || 99) <= 3; } },

    { id: 'breakout_win',icon: '🧨', name: '破壁者',     desc: '清空打砖块全部砖块',
      test: function (c) { return (c.metrics.breakout_wins || 0) >= 1; } },
    { id: 'flappy_10',   icon: '🐤', name: '飞行健将',   desc: '像素鸟通过 10 根管道',
      test: function (c) { return (c.metrics.flappy_pipes || 0) >= 10; } },
    { id: 'dodger_60',   icon: '🚀', name: '躲闪大师',   desc: '躲避障碍坚持 60 秒',
      test: function (c) { return (c.metrics.dodger_time || 0) >= 60; } },
    { id: 'pinball_2k',  icon: '🔮', name: '弹球高手',   desc: '弹球单局得分 ≥ 2000',
      test: function (c) { return (c.metrics.pinball_score || 0) >= 2000; } }
  ];

  function context() {
    var d = GH.Store.all();
    return {
      scores: d.scores,
      plays: d.plays,
      stats: d.stats,
      metrics: d.metrics,
      unlocked: d.unlocked
    };
  }

  GH.Achievements = {
    list: LIST,
    get: function (id) {
      for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
      return null;
    },
    isUnlocked: function (id) { return GH.Store.isUnlocked(id); },
    unlockedCount: function () {
      return LIST.filter(function (a) { return GH.Store.isUnlocked(a.id); }).length;
    },
    total: function () { return LIST.length; },

    /* 每局结束后调用，返回本次新解锁的成就数组 */
    evaluate: function () {
      var c = context();
      var fresh = [];
      LIST.forEach(function (a) {
        if (c.unlocked.indexOf(a.id) > -1) return;
        var ok = false;
        try { ok = !!a.test(c); } catch (e) { ok = false; }
        if (ok && GH.Store.unlock(a.id)) fresh.push(a);
      });
      return fresh;
    }
  };
})(window.GH);
