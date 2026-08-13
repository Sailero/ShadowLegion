# Phase 2: 自博弈模式设计文档

## 核心概念

玩家在每一关中与「自己的进化版影子」对战。系统记录玩家行为，生成越来越强的 AI 对手（Shadow），形成**"打自己"的无限关卡**。

## 关卡结构

```
关卡 1: 玩家 + 初始规则AI 队友  vs  基础敌人波次
关卡 2: 玩家 + 规则AI           vs  基础敌人 + Shadow_1（基于关卡1玩家数据）
关卡 3: 玩家 + 规则AI           vs  基础敌人 + Shadow_1 + Shadow_2（基于关卡1-2数据）
关卡 4: 玩家 + 规则AI           vs  基础敌人 + Shadow_1 + Shadow_2 + Shadow_3
...
关卡 N: 玩家 + 规则AI           vs  基础敌人 + Shadow_{N-4}...Shadow_{N-1}（最多5个Shadow）
```

### 关键规则
- Shadow 数量上限 = **5个**，保留最近5关的 Shadow
- 每个 Shadow 基于对应关卡的玩家行为数据生成
- Shadow 作为**特殊精英敌人**出现在波次中（不替代普通敌人，而是额外添加）
- 随关卡推进，Shadow 获得小幅属性增长（+5%/关 的 HP 和伤害）

## Shadow 生成流程

### 1. 行为录制（每关进行中）

每 200ms 采样一次，记录状态-动作对：

```typescript
interface BehaviorSample {
  // 状态特征
  heroPos: [number, number];         // 归一化位置
  heroVelocity: [number, number];    // 归一化速度
  hpRatio: number;                   // 当前HP百分比
  nearestEnemyDist: number;          // 最近敌人距离
  nearestEnemyAngle: number;         // 最近敌人角度
  enemyCountNearby: number;          // 附近敌人数量
  chargeRatio: number;               // 蓄力百分比
  dashReady: boolean;                // 闪避是否就绪

  // 玩家动作
  moveAngle: number;                 // 移动方向
  aimAngle: number;                  // 瞄准方向
  firing: boolean;                   // 是否开火
  dashing: boolean;                  // 是否闪避
  blasting: boolean;                 // 是否释放蓄力
}
```

### 2. 参数提取（关卡结束时）

从样本中统计提取 **8个行为参数**：

| 参数 | 含义 | 提取方式 |
|------|------|---------|
| aggression | 激进度 | 平均战斗距离的倒数归一化 |
| moveActivity | 移动活跃度 | 非零速度帧占比 |
| dodgeFreq | 闪避频率 | 每分钟闪避次数 |
| fireRate | 开火密度 | 开火帧占比 |
| targetPriority | 目标优先级 | 攻击最近vs最弱的倾向 |
| retreatThreshold | 撤退阈值 | HP低于多少时倾向后退 |
| chargeUsage | 蓄力使用时机 | 满后平均等待时间 |
| circleStrafe | 环绕走位 | 横向移动占比 |

### 3. Shadow AI 决策逻辑

```
决策树结构：

IF hpRatio < shadow.retreatThreshold:
    → 远离玩家（retreatBehavior）
ELIF nearestTargetDist > shadow.aggression * 300:
    → 向目标靠近（chaseBehavior）
ELSE:
    IF random() < shadow.circleStrafe:
        → 环绕走位（strafeBehavior）
    ELSE:
        → 直线靠近（directChase）

开火决策：
    IF random() < shadow.fireRate && targetInRange:
        → 射击

闪避决策：
    IF incomingDangerDetected && random() < shadow.dodgeFreq * 0.1:
        → 闪避

蓄力决策：
    IF chargeReady && nearbyEnemies > 2 * (1 - shadow.chargeUsage):
        → 释放蓄力
```

### 4. Shadow 视觉设计

- 外观：半透明的玩家模型，带有发光轮廓（颜色随关卡变化）
- 关卡1的Shadow：蓝色光晕
- 关卡2的Shadow：紫色光晕
- 关卡3+的Shadow：红色光晕
- Shadow 头顶显示「Shadow Lv.N」标签
- Shadow 死亡时有特殊粒子效果（像玻璃碎裂）

## 技术架构

### 数据存储

```typescript
interface ShadowData {
  level: number;               // 来源关卡
  params: BehaviorParams;      // 8个行为参数
  stats: {
    baseHp: number;
    baseDamage: number;
    baseSpeed: number;
  };
  createdAt: number;           // 时间戳
}

// 使用 localStorage 持久化
const SHADOW_STORAGE_KEY = 'shadow_legion_shadows';
const MAX_SHADOWS = 5;
```

### 文件结构（新增）

```
src/
├── systems/
│   ├── BehaviorRecorder.ts    // 行为录制器
│   ├── ShadowFactory.ts       // Shadow AI 生成器
│   └── ShadowManager.ts       // Shadow 管理（存储/加载/关卡分配）
├── entities/
│   └── ShadowEnemy.ts         // Shadow 敌人实体（继承 Enemy）
└── data/
    └── shadowConfig.ts        // Shadow 相关配置
```

### 实现优先级

1. **P0 - 行为录制**：在现有 ArenaScene 中添加录制逻辑（不影响 Phase 1）
2. **P0 - 参数提取**：关卡结束时从录制数据提取参数
3. **P1 - Shadow 实体**：创建 ShadowEnemy 类
4. **P1 - Shadow 决策树**：基于参数的 AI 逻辑
5. **P2 - 无限关卡**：关卡系统扩展
6. **P2 - 视觉效果**：Shadow 特殊外观和粒子
7. **P3 - 数据可视化**：行为参数雷达图

## 玩家体验流程

```
第一次游戏：
  关卡1 → 正常打完 → 系统录制行为 → 关卡结束
  关卡2 → 一个半透明的"你"出现在敌人中 → 它的走位和你很像
  → "卧槽它在学我的操作"
  → 玩家调整策略来克制自己的弱点
  关卡3 → 两个影子，一个像关卡1的你，一个像关卡2的你
  → 玩家需要同时应对不同版本的自己
  ...
  关卡10 → 5个影子同时出现，它们代表了你过去5关的进化轨迹

社交分享：
  → "我的影子军团太猛了，关卡15才死"
  → 排行榜按存活关卡数排名
```

## 对比：Shadow vs 普通规则队友

| 维度 | 规则队友 | Shadow 敌人 |
|------|---------|------------|
| 行为来源 | 开发者设计 | 玩家自己的数据 |
| 每局变化 | 无 | 随玩家风格变化 |
| 心理效果 | "NPC在帮我" | "我在和自己对战" |
| 难度曲线 | 固定 | 随玩家成长自适应 |
| 可重玩性 | 低 | 极高（每次不同） |
| 差异化 | 无 | 每个玩家独一无二 |

## 风险与对策

| 风险 | 对策 |
|------|------|
| Shadow 太弱，无法构成威胁 | 设置属性下限 + 关卡缩放 |
| Shadow 太强，导致不公平 | 设置属性上限 + 难度平衡系数 |
| 行为参数不够区分度 | 增加更多维度（12-15个参数） |
| 首次玩没有Shadow数据 | 关卡1纯Phase1体验，自然过渡 |
| 存储空间 | 每个Shadow仅存8个float参数 + 元数据 |
