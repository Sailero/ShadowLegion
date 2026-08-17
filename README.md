# Shadow Legion - 影之军团

> 俯视角动作生存游戏，融合行为克隆驱动的AI进化系统

## 概述

Shadow Legion 是一款基于 Phaser 3 的 2D 俯视角动作生存游戏。玩家操控英雄在竞技场中对抗逐波袭来的敌人，通过击杀获取经验、解锁技能和升级来不断变强。

**核心创新**：Phase 2 将引入"影子军团"系统——系统记录玩家行为并生成模仿玩家风格的 AI 分身，实现"与无数个自己并肩作战或对战"的独特体验。

## 快速开始

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 生产构建
```

## 游戏操作

| 操作 | 按键 |
|------|------|
| 移动 | WASD |
| 瞄准/射击 | 鼠标（自动射击） |
| 闪避翻滚 | Shift |
| 释放技能 | Space |
| 切换技能 | Q |

## 当前内容 (Phase 1)

- **6 种敌人**：史莱姆、蝙蝠、弓箭手、重甲、忍者、召唤师
- **精英怪系统**：闪避、突进、智能避弹等高级 AI
- **Boss 战**：冲锋、环形弹幕、散射等多阶段攻击
- **3 种主动技能**：能量爆发、弹幕、时间裂缝（可升级）
- **20+ 升级选项**：暴击、吸血、爆炸弹、弹射、冰冻等
- **3 关 30 波 + 无尽模式**
- **互动新手教程**
- **程序化音效系统**（Web Audio API）

## 技术栈

| 技术 | 说明 |
|------|------|
| Phaser 3 | HTML5 2D 游戏框架 |
| TypeScript | 类型安全开发 |
| Vite | 快速构建工具 |

## 项目结构

```
Game/
├── docs/                   # 文档
│   ├── research/           # 市场调研 & AI研究
│   ├── design/             # 设计文档
│   └── changelog.md        # 变更日志
├── src/
│   ├── config/             # 游戏配置 (gameConfig.ts)
│   ├── data/               # 数据定义 (敌人/技能/升级)
│   ├── entities/           # 游戏实体 (Hero/Enemy/Projectile)
│   ├── scenes/             # Phaser 场景
│   ├── systems/            # 系统 (波次/升级/音效/教程)
│   ├── utils/              # 工具 (SpriteFactory)
│   └── test/               # 运行时测试
└── package.json
```

## 文档

- [Phase 2 自博弈设计](docs/design/phase2-self-play-plan.md)
- [AI 策略研究](docs/research/drivatar-and-player-strategy-research.md)
- [市场对比分析](docs/research/market-comparison-v0.3.md)
- [变更日志](docs/changelog.md)

## 许可

私有项目，保留所有权利。
