# 技术架构文档

> 版本：v0.1.0  
> 更新日期：2026-08-13

---

## 一、技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 游戏引擎 | **Phaser 3** (稳定版) | 成熟的 HTML5 2D 游戏框架，社区活跃 |
| 开发语言 | **TypeScript** | 类型安全，适合策略游戏的复杂逻辑 |
| 构建工具 | **Vite** | 快速 HMR，开发体验好 |
| 包管理 | **npm** | 标准 Node.js 包管理 |
| 版本管理 | **Git** | 标准版本控制 |

---

## 二、项目结构

```
Game/
├── docs/                          # 文档目录
│   ├── research/                  # 调研文档
│   │   └── market-research.md     # 市场调研报告
│   ├── design/                    # 设计文档
│   │   ├── game-design-doc.md     # 游戏设计文档（GDD）
│   │   └── tech-architecture.md   # 技术架构文档（本文件）
│   └── changelog.md               # 版本变更日志
├── src/                           # 源代码
│   ├── index.html                 # 入口 HTML
│   ├── main.ts                    # 游戏主入口
│   ├── config/
│   │   └── gameConfig.ts          # Phaser 配置 + 游戏常量
│   ├── scenes/
│   │   ├── BootScene.ts           # 资源加载
│   │   ├── MenuScene.ts           # 主菜单
│   │   ├── GameScene.ts           # 核心战斗场景
│   │   └── UIScene.ts             # UI 覆盖层（HUD）
│   ├── core/
│   │   ├── HexGrid.ts             # 六边形网格系统
│   │   ├── HexTile.ts             # 单个六边形格子
│   │   ├── Unit.ts                # 单位基类
│   │   ├── Building.ts            # 建筑基类
│   │   ├── GameState.ts           # 游戏状态管理
│   │   └── TurnManager.ts         # 回合管理器
│   ├── ai/
│   │   ├── AIController.ts        # AI 主控制器
│   │   ├── strategies/
│   │   │   ├── BaseStrategy.ts    # 策略基类
│   │   │   ├── AggressiveStrategy.ts
│   │   │   ├── DefensiveStrategy.ts
│   │   │   └── BalancedStrategy.ts
│   │   └── DifficultyManager.ts   # 动态难度调整
│   └── utils/
│       └── helpers.ts             # 工具函数
├── assets/                        # 美术/音效资源
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

---

## 三、核心模块设计

### 3.1 六边形网格系统

采用 **Axial 坐标系统**（q, r），参考 Red Blob Games 的六边形网格算法。

```
坐标转换：
  Axial (q, r) ↔ Cube (x, y, z)  其中 x + y + z = 0
  Axial (q, r) ↔ Pixel (px, py)   用于渲染

核心方法：
  - axialToPixel(q, r) → {x, y}    坐标转像素
  - pixelToAxial(x, y) → {q, r}    像素转坐标
  - getNeighbors(q, r) → [{q,r}]   获取相邻格子
  - getDistance(a, b) → number      计算两格距离
  - getRing(center, radius) → []    获取指定半径的环
  - getReachable(start, range) → [] BFS 可达范围
```

### 3.2 游戏状态管理

使用**不可变状态模式**，方便回溯和 AI 推演：

```
GameState {
  turn: number                  // 当前回合
  phase: Phase                  // 当前阶段
  currentPlayer: PlayerId       // 当前行动方
  grid: HexGrid                 // 地图状态
  units: Map<UnitId, Unit>      // 所有单位
  buildings: Map<BldId, Building> // 所有建筑
  resources: Map<PlayerId, Resources> // 资源
  fogOfWar: Map<PlayerId, Set<HexCoord>> // 迷雾
}
```

### 3.3 AI 架构

```
AIController
  ├── StrategySelector     # 策略选择器（根据局势选策略）
  │   ├── AggressiveStrategy  # 侧重进攻
  │   ├── DefensiveStrategy   # 侧重防守
  │   └── BalancedStrategy    # 均衡发展
  ├── ActionPlanner        # 行动规划器（生成具体操作序列）
  └── DifficultyManager    # 难度管理器（调节 AI 强度）
```

---

## 四、数据流

```
用户输入 → InputHandler → GameScene
                              ↓
                        TurnManager
                         ↙      ↘
                 玩家回合      AI 回合
                    ↓            ↓
              PlayerAction   AIController
                    ↓            ↓
                 GameState (统一更新)
                    ↓
              Renderer (重新渲染)
                    ↓
              UIScene (更新 HUD)
```

---

## 五、后续技术规划

### 5.1 AI 进阶（v0.3+）

- 引入 TensorFlow.js 或 ONNX Runtime Web 运行预训练的 RL 模型
- 在服务端（Python）进行 AI 训练，导出模型到前端推理
- 实现在线玩家行为数据收集 → 模型更新的闭环

### 5.2 多人对战（v0.5+）

- WebSocket 实时通信
- 游戏状态同步（帧同步或状态同步）
- 匹配系统和 ELO 排名

### 5.3 微信小游戏适配

- Phaser 支持导出为微信小游戏格式
- 使用 weapp-adapter 适配微信小游戏 API
- 适配微信登录、分享、排行榜等社交功能
