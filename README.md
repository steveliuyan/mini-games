# 🎮 小游戏合集 · Game Hub

16 款经典小游戏的纯前端合集。**零依赖、零构建、零联网**，双击 `index.html` 即可开玩。

> 🌐 在线版：<https://game.20050905.xyz>
> 源码：<https://github.com/steveliuyan/mini-games>

- 统一游戏大厅（分类筛选 / 搜索 / 卡片式入口）
- 每款游戏独立最高分（localStorage 持久化）
- 26 项成就墙 + 全局统计（对局数、游玩时长、通关数）
- Web Audio 纯代码合成音效（无任何音频文件）
- 键盘 + 触屏双通道操作，手机可直接玩
- 存档导出 / 导入 / 清空

---

## 快速开始

```
双击 index.html
```

就这一步。无需 Node、无需 npm、无需起服务。

> 如果浏览器对 `file://` 的 localStorage 有限制（部分安全策略较严的环境），
> 可用任意静态服务器打开：`python -m http.server 8080` 后访问 `http://localhost:8080`。

---

## 游戏清单

| 分类 | 游戏 | 操作 |
| --- | --- | --- |
| 🎮 经典休闲 | 贪吃蛇 | 方向键 / WASD 转向 |
| 🎮 经典休闲 | 俄罗斯方块 | ← → 移动，↑ 旋转，↓ 软降，空格硬降 |
| 🎮 经典休闲 | 2048 | 方向键滑动合并 |
| 🎮 经典休闲 | 扫雷 | 点击揭开，右键 / 长按插旗（手机可开「标记模式」） |
| 🧩 益智脑力 | 记忆翻牌 | 点击翻牌配对，4×4 / 6×6 双难度 |
| 🧩 益智脑力 | 数独 | 点格选中，数字键或面板填数 |
| 🧩 益智脑力 | 推箱子 | 方向键推箱，U 键撤销，6 个内建关卡 |
| 🧩 益智脑力 | 华容道 | 点选滑块后方向键，或直接拖拽（横刀立马） |
| ⚔️ 对局竞技 | 五子棋 | 点击落子，AI 三档难度，可悔棋 |
| ⚔️ 对局竞技 | 井字棋 | 点击落子，困难档 Minimax 不可战胜 |
| ⚔️ 对局竞技 | 黑白棋 | 点击落子，AI 三档，自动跳过无子可下 |
| ⚔️ 对局竞技 | 猜数字 | 输入 1~100，回车提交，10 次机会 |
| 🕹️ 街机反应 | 打砖块 | ← → 移动挡板，空格发球 |
| 🕹️ 街机反应 | 弹球 | ← → 控制挡板，空格发射 / 双板齐抬 |
| 🕹️ 街机反应 | 像素鸟 | 空格 / 点击屏幕扇翅膀 |
| 🕹️ 街机反应 | 躲避障碍 | ← → 移动飞船，躲陨石 |

**全局快捷键**：`P` 暂停 / 继续，`R` 重新开始，`Esc` 返回大厅或关闭弹窗。

触屏设备会自动出现屏幕虚拟按键，部分游戏支持直接在画面上滑动。

---

## 目录结构

```
小游戏合集/
├── index.html              单页入口（大厅 + 游戏页）
├── css/
│   ├── base.css            主题变量、重置、Toast / 弹层 / 按钮
│   ├── hall.css            大厅：Hero、分类页签、游戏卡片、成就墙
│   └── game.css            游戏页外壳、棋盘通用样式、虚拟方向键
└── js/
    ├── boot.js             启动入口（DOMContentLoaded → Hub.boot）
    ├── core/
    │   ├── util.js         事件总线、DOM 助手、数学/格式化、定时器托管、几何
    │   ├── audio.js        Web Audio 合成音效引擎（19 种音效）
    │   ├── store.js        localStorage 存档层（成绩 / 统计 / 成就 / 设置）
    │   ├── achievements.js 26 项成就定义与评估
    │   ├── ui.js           Toast、结算、暂停、确认、成就解锁弹层
    │   └── hub.js          注册表、路由、大厅渲染、游戏宿主与运行时 API
    └── games/              16 个游戏模块，各自独立自注册
        ├── snake.js  tetris.js  g2048.js  minesweeper.js
        ├── memory.js sudoku.js  sokoban.js klotski.js
        ├── gomoku.js tictactoe.js reversi.js guessnumber.js
        └── breakout.js pinball.js flappy.js dodger.js
```

---

## 新增一款游戏

在 `js/games/` 下建一个文件，按下面契约自注册，然后在 `index.html` 末尾加一行 `<script>` 即可。

```js
(function (GH) {
  'use strict';
  var U = GH.util;

  GH.Hub.register({
    id: 'mygame',            // 唯一 id
    name: '我的游戏',
    icon: '🎯',
    color: '#5b8cff',        // 卡片主色
    category: 'classic',     // classic | puzzle | versus | arcade
    tags: ['标签'],
    desc: '一句话描述，不超过 22 字',
    hint: '操作提示',
    touch: 'swipe+dpad',     // swipe | dpad | dpad+action | tap | null
    dpad: ['left', 'right', 'space'],  // 可选，自定义虚拟按键

    mount: function (root, api) {
      var g = api.canvas({ w: 400, h: 600 });   // 世界坐标，自动适配 + DPR
      var ctx = g.ctx;

      api.loop(function () {                    // 自动托管的逐帧循环
        if (api.isPaused()) return;             // 暂停 / 结束时必须跳过推进
        // ... 更新与绘制
      });

      api.onKey(function (name, e, phase) {     // up/down/left/right/space/enter/…
        if (phase !== 'down') return;
      });

      api.setScore(0);
      api.finish({ win: true, metrics: { my_metric: 1 } });  // 结束一局，只能调一次

      return { destroy: function () {}, restart: function () {} };
    }
  });
})(window.GH);
```

**可用的 `api`**：`canvas` `setScore` `addScore` `getScore` `getBest` `setStatus` `hint`
`ctrlBar` `onKey` `press` `loop` `timeout` `interval` `raf` `clearTimeout` `clearInterval`
`isPaused` `isFinished` `restart` `setPaused` `setDpad` `finish` `audio` `toast` `info` `confirm`
以及 `randInt` `randFloat` `choice` `shuffle` `chance` `clamp` `lerp` `dist` `rgba` `fmtNum` `el` `on` `clear`。

**约定**：所有定时器 / 动画帧一律通过 `api` 创建，框架会在切换游戏时自动回收；
画布一律用世界坐标绘制，适配由框架处理；不要引用任何外部资源。

---

## 数据存储

全部数据存在浏览器 `localStorage` 的单个键 `gamehub.save.v1` 下，**不上传任何数据**。

在大厅底部可「导出存档」为 JSON、或「导入存档」恢复、或「清空全部记录」。

---

## 验证记录

`node --check` 覆盖全部 23 个 JS 文件；用 Edge + CDP 做真实浏览器端到端走查：
16/16 游戏挂载成功、**0 运行时错误**，交互（点击落子 / 翻牌 / 填数 / 推箱 / 拖拽 / 发球 / 扇翅）
与计分链路均实测通过。可复现脚本见 `.workbuddy/tools/final.js`，逐款截图见 `.workbuddy/tools/final/`。

### 速度专项复核（v1.0.1）

针对「贪吃蛇太快」的反馈做全量速度/手感审计，实测数据：

| 项目 | 实测 |
| --- | --- |
| 贪吃蛇 轻松 / 标准 / 挑战 撞墙用时 | 2407 / 1959 / 1524 ms（标称 2350 / 1850 / 1450，偏差 &lt;6%） |
| 贪吃蛇 静置是否自动移动 | 否（`ready` 阶段，按下方向键才起步）|
| 俄罗斯方块 长按连移 | 单击 0.98 格；长按 170ms 后开始 45ms/格 连移，贴墙自停 |
| 打砖块 拖动挡板 | 指针 x 0.50 → 0.06 → 0.81，跟随准确 |
| 躲避障碍 拖动飞船 | 指针 x 0.50 → 0.16 → 0.84，跟随准确 |
| 像素鸟 机器人实测 | 连续通过 5 根管道（证明成长曲线可玩）|
| 全量回归 | 16/16 挂载、0 运行时错误 |

像素鸟可玩性用**像素级机器人玩家**（从 canvas 识别小鸟与管道缺口、注入按键）实测，
脚本 `.workbuddy/tools/flappybot.js`；速度专项脚本 `.workbuddy/tools/verify2.js`。
