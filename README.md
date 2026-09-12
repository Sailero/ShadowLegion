# 暖影同行 / Sunlit Echoes

温暖风格的 PC 浏览器动作守护肉鸽：借地形守住营地，搭出自己的技能流派，让上一局的战斗习惯成为下一局的影伴。

当前候选版 **1.2.0-rc.1**。完整工程检查已通过：47 组回归、类型检查、生产资产检查，最终依赖审计 0 已知漏洞。可交接的 [静态发布包说明](release/shadow-legion-web-1.2.0-rc.1-2026-09-12T05-18-38-376Z/DEPLOY.md) 随附文件哈希与第三方许可证。

固定来路和地形决定站位，四个伙伴和三选一升级改变守法；影伴可以同行或守营，给你腾出转线和处理后排的机会。可选镜像切磋让你面对自己的行为倾向。影子使用本机行为统计与规则决策，不需要服务器，不声称是训练型 AI。

## 浏览器试玩

需要 Node.js ≥22.15，推荐 Node 24。

```bash
npm ci --ignore-scripts
npm run dev
```

打开终端显示的本地地址。生产版预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

不要直接双击 `dist/index.html`；浏览器版需要 HTTP(S)。进度和设置保存在当前浏览器本机；不同域名、协议和端口不会共享存档。

## 当前内容

- 四章各五波：树径掩体、暖砂、潮汐栈桥和灯带街区，各有不同来路与地形规则。
- 四种守护打法：机动爆发、连射穿透、迟滞护盾、蜜蜂部署；三次同流派专精触发进化。
- 新档就有见习影伴，之后继承上局习惯；支持同行/守营与可选镜像切磋。
- 每章三个旅途委托，把指挥、守营和地形利用串进战斗。
- 章节与技能解锁、有限工坊成长、本机成绩、章节起点续玩与有效战斗计时。
- 纸张与花园视觉、柔和音效、音量、减少动态效果和持续射击设置。

## PC 操作

| 操作 | 按键 |
|---|---|
| 移动 | WASD |
| 瞄准 / 射击 | 鼠标 / 按住左键 |
| 闪避 | Shift 或鼠标右键 |
| 职业技能 | Space（能量充满） |
| 切换技能 | Q |
| 影伴同行 / 守营 | E |
| 选择升级 | 1 / 2 / 3 或鼠标 |
| 暂停 | Esc |

## 检查与发布包

```bash
npm test
npm run analyze:pacing
npm run check
npm run check:security
npm run release:web
```

`check` 执行真实逻辑回归（部分实体方法使用最小 Phaser 数学边界，不是浏览器集成测试）、TypeScript 检查、生产构建和静态资产检查。`release:web` 额外审计依赖，在 `release/` 下生成带版本和时间戳的静态目录，附部署说明、许可证和 SHA-256 清单；不会上传。

`analyze:pacing` 是理论敌人负载模型，不是实测局长。真实试玩会在本机保留最近 120 条已完成波次的有效战斗用时；`SessionMetricsManager.summary()` 返回各章样本数、单波中位数和 p90。数据不上传，小样本也不代表整体平衡或整章时长。

当前控制浏览器的连接不可用，本轮无法完成真实画面、兼容和性能验收；外部玩家盲测也尚未执行。完整证据见 [发行准备](docs/release-readiness.md)，不能把自动检查通过当成所有商业上线标准通过。

历史 Electron 便携包与本轮浏览器版不是同一构建。保留 `npm run desktop` / `npm run package:win`，但旧 `Shadow-Legion-1.1.0-Portable.exe` 未在本轮重新打包和验收。

## 文档

- [产品总纲与实现边界](docs/project-master-plan.md)
- [市场、可玩性与局长研究](docs/market-and-playability-research.md)
- [发行准备与验收记录](docs/release-readiness.md)

Phaser 3 + TypeScript + Vite；Electron 为可选桌面封装。私有项目，保留所有权利；运行时开源依赖许可证随发布目录附带。
