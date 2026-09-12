# 暖影同行 / Sunlit Echoes

温暖风格的 PC 浏览器动作守护肉鸽：借地形守住营地，搭出自己的技能流派，让上一局的战斗习惯成为下一局的影伴。

当前候选版 **1.3.0-rc.3**：五章五十个独立小关卡、战役 / 无尽 / 影子切磋三种模式，以及装备、营地研究和角色专精。本轮修复通关奖励补存、角色解锁恢复、影子逐档首胜奖励和结算重试；备份保留待确认凭据，设置显示实际构建版本。**159 项测试、TypeScript / 生产构建、静态检查和依赖审计通过，0 已知依赖漏洞**。最终静态包与标准 ZIP 已生成并逐项读回校验。准确证据与待测项见 [发行准备](docs/release-readiness.md)。

固定来路和地形决定站位，四个伙伴和三选一升级改变守法；影伴可以同行或守营，给你腾出转线和处理后排的机会。每个小关有自己的路线、遭遇和两项额外星级目标；五阶影子切磋让你练习读招、走位和双目标选择。影子使用本机行为统计与规则决策，不需要服务器，不声称是训练型 AI。

真实 Edge 普通生产包完成首关、领取奖励及购买装备；新标签页载入 rc.3 后保留进度与设置，并将装备生命值带入第二关实际战斗。该记录不是真人盲测，第一关结算发生在 rc.2，版本和步骤分别记录在 [Edge 观察日志](docs/qa/1.3.0-rc.3/edge-observations.json)。营地固定后的最终构建二十分钟复测、其他浏览器、参考硬件与真人体验仍待验证。

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

在营地打开“旅途设置”，选择“备份旅途”下载 JSON；迁移设备或站点时，先选“恢复旅途”查看通关、星章和暖晶，再确认恢复。文件不上传；战斗中不能恢复。读取、验证或写入失败会给出明确提示，写入中断会尝试还原原记录。

## 当前内容

- 五章各十关，共五十个独立关卡：独立名称、地图几何、来路组合、敌人编排与三星目标；包含暖风草地、杏沙小镇、薄荷港湾、花灯集市、晴空花园。
- 战役逐关解锁与重玩；无尽巡游逐站加压；影子切磋五阶各三轮，包含单影到双影的不同节奏。
- 四种守护打法：机动爆发、连射穿透、迟滞护盾、蜜蜂部署；开场改装、波间三选一和局内流派进化。
- 第 3 / 8 / 15 关解锁新伙伴与技能；三项五级基础装备、六项营地研究、每角色七级熟练度与三选一专精。已购专精可免费重配，效果有明确取舍。
- 新档就有见习影伴；之后继承上局习惯，支持同行 / 守营；永久成长、模式纪录、关卡 / 站点起点续玩均在本机保存。
- 原创生成的水粉旅行插画、角色与地面图集，配合旅行书页、邮戳与路线地图；柔和音效、音量、减少动态效果和持续射击设置。

当前理论负载模型中，多数关卡在“初步流派”假设下约为 **30–150 秒活跃战斗，另假设 20–40 秒读卡**。这些是模型预算，不是实测单关时长；正常玩家的成功率、读图时间与完整路线体验仍需试玩验证。

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

Windows 可在发布目录检查完成后使用标准 ZIP 脚本；将参数换成实际生成的目录：

```powershell
.\scripts\package-web-release.ps1 -ReleaseDirectory ".\release\shadow-legion-web-1.3.0-rc.2-<timestamp>"
```

脚本输出同一 `release/` 父目录中的版本 ZIP，使用正斜杠条目，并校验源文件与 ZIP 内部 SHA-256；拒绝额外文件、路径穿越、链接、清单不符和覆盖已有包，不改动发布源目录。

最终包为 `release/Sunlit-Echoes-1.3.0-rc.2-web.zip`，**3,155,016 字节**，SHA-256：`546D2AEF1B044FDF4BF6B1BE8488580A54D19FA7FF5226825BF10D36E662CC62`。运行内容约 4.48MB、JS gzip 424.62kB；[发布清单](docs/release-manifest-1.3.0-rc.2.json) 保存八个文件的校验值。体积检查不能证明加载速度或帧率。

`analyze:pacing` 是理论敌人负载模型，不是实测局长。真实试玩会在本机保留最近 120 条已完成波次的有效战斗用时；`SessionMetricsManager.summary()` 返回各章样本数、单波中位数和 p90。数据不上传，小样本也不代表整体平衡或整章时长。

rc.2 的隔离 Electron 44 / Chromium 152.0.7977.54 已验证生产包备份预览、取消、恢复后读回、下载往返及战斗禁用恢复；1280×720 设置首焦音量、标题可见、Tab 循环和关闭后画布焦点通过。文件读取使用真实 DOM File API，系统文件选择器没有自动化。[备份报告](docs/qa/1.3.0-rc.2/backup.json)、[焦点报告](docs/qa/1.3.0-rc.2/settings-focus.json)

修复前持续运行曾发现无尽满卡转场卡在第 0 波；修复后一分钟诊断在第 46 / 47 站实际出敌，四种结束顺序各只结算一次。营地固定修复前的缓存版已完成二十分钟协议：高密度、无尽、双影、十次重开与四种结束边界，错误为空。[失败记录](docs/qa/1.3.0-rc.2/soak-initial-failure.json)、[修复后短测](docs/qa/1.3.0-rc.2/endless-regression.json)

本轮还重新通过 [五十关与无尽承接流程](docs/qa/1.3.0-rc.2/campaign-flow.json)，以及 [影子纪录拒写、暖晶独立到账与结算提示](docs/qa/1.3.0-rc.2/shadow-save-failure.json) 检查；这些使用加速战斗与隔离测试档案，不是玩家成绩或平衡样本。

战斗通知现在只保留一条固定浅底提示，重要事件优先；最长波次正文、Boss 血条、连击与底部操作反馈的边界检查通过。[通知报告与测试范围](docs/qa/1.3.0-rc.2/announcements.json)、[注入提示场景截图](docs/qa/1.3.0-rc.2/announcement-boundaries.png)

前一版 rc.1 已验证原生移动、指挥、技能能量提示、暂停、影子结算、五十关加速流程和生产包续玩。它们属于历史基线，自动流程不是正常玩家通关与平衡证明。[rc.1 验证摘要](docs/validation-1.3.0-rc.1.json)、[首页截图](docs/qa/1.3.0-rc.1/production-menu.png)、[战场截图](docs/qa/1.3.0-rc.1/production-battle.png)

用户浏览器扩展连接仍不可用；Chrome、Edge、Firefox 兼容、参考硬件性能与真人盲测尚未完成。完整证据与未完成项见 [发行准备](docs/release-readiness.md)。

GitHub CI 使用 Node 24 执行检查与理论节奏分析。前一版提交 `1b5f61a` 的 [远端 CI 已成功](https://github.com/Sailero/ShadowLegion/actions/runs/34677761133)；rc.2 代码提交 `0d32172` 的 [独立远端 CI 也已通过](https://github.com/Sailero/ShadowLegion/actions/runs/34695424358)。

营地固定修复前的缓存版完成 **1207.134 秒**实时持续运行，覆盖高密度敌群、无尽第 46–58 站实际战斗、第五阶双影和十次重开，四种结束顺序均只结算一次，错误为空。全段 rAF 帧间隔 median / p95 / p99 为 **16.7 / 16.8 / 16.8ms**，最大 100.0ms。峰值 160 个敌人、200 个活跃玩家弹道；JS heap 峰值 150.2MiB，四阶段强制 GC 后 62.9–63.8MiB。每个采样中的活跃战场恰好一张地面缓存，全部纹理数量范围 55–110；四种战斗监听器均保持一份。测试使用共享开发机的隔离 Electron 44 / Chromium 152、自动控制与生命补充，没有加速战斗时钟；它不能证明普通难度、真人可玩性、目标浏览器或最低配置性能。 [最终持续运行](docs/qa/1.3.0-rc.2/soak-cached.json)、[性能对照](docs/render-performance.md)、[rc.2 验证摘要](docs/validation-1.3.0-rc.2.json)。

游戏美术位于 [`src/public/art/`](src/public/art/)：透明角色保持 PNG，主视觉与地面采用 JPEG；对应未压缩生成原图保留在 [`art/source/`](art/source/)。提示与编码用途记录在 [美术来源清单](docs/art-generation-manifest.json)；第三方游戏图片仅用于方向研究，没有放入游戏素材。

1.2.0-rc.1 静态目录及其 47 项测试记录属于历史版本，不代表 1.3.0 的发布验收。保留 `npm run desktop` / `npm run package:win`，但旧 `Shadow-Legion-1.1.0-Portable.exe` 未在本轮重新打包和验收。

## 文档

- [产品总纲与实现边界](docs/project-master-plan.md)
- [市场、可玩性与局长研究](docs/market-and-playability-research.md)
- [五十关节奏分析](docs/campaign-pacing-v2.md)
- [长期成长、角色专精与经济预算](docs/progression-design.md)
- [绘本美术方向](docs/art-direction-v2.md)
- [发行准备与验收记录](docs/release-readiness.md)
- [静态花园性能对照](docs/render-performance.md)

Phaser 3 + TypeScript + Vite；Electron 为可选桌面封装。项目保留所有权利；运行时开源依赖许可证随发布目录附带。
