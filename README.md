# 暖影同行 / Sunlit Echoes

拟人布偶猫棉棉带着一袋回信，与记住她脚步的影伴小暖，把远方的朋友重新联系起来。新定位是温暖、需要操作与分工的 Steam PC 送信冒险，首次完整体验的制作目标约三小时。

当前开发版 **1.4.0-alpha.3** 已接入**风铃森林、圆镜湖与云阶山三地区可玩原型**。小暖从留守扶桥、稳舟运信，成长到沿独立路线传递铃声、等待棉棉回应。地区按真实投递依次开放，旧练习星章不替代主线交信。晒被沙原、晴雪湾和完整三小时作品仍未完成，尚未达到 Steam 发布就绪状态。

云阶山有两段参与顺序不同的接力：先由小暖响两声、棉棉收尾，再由棉棉补中间一声，让小暖继续。错铃会提示下一声并保留正确前缀；奶油山路、蜜桃山壁和云海之间，还有可选侧风路线与避风平台。详见 [山地实现记录](docs/mountain-implementation.md)；该片 **8–12 分钟只是制作预算，尚无首次游玩时长实测**。

多地区投递、安全续玩点与可选发现纳入**十项本机数据备份**。主旅程内容升级为 v3，兼容迁移旧 v2；成功确认的节点才推进路线，不保存半段铃序或角色坐标。数据保存在当前浏览器本机，不是云存档。

**最终 `release:web` 退出 0，389/389 自动检查、TypeScript、Vite、静态检查与依赖审计全部通过，0 已知依赖漏洞。** [alpha.3 本机试玩 ZIP](release/Sunlit-Echoes-1.4.0-alpha.3-web.zip) 已独立逐项读回核对；精确字节、哈希和文件范围见 [包校验记录](docs/qa/1.4.0-alpha.3/package-verification.json)、[发布清单](docs/release-manifest-1.4.0-alpha.3.json) 与 [发行准备](docs/release-readiness.md)。

Edge 中间构建 `index-CUa5r551.js` 已用普通输入完成两段接力、连续宽路上山、穿门、F 交信与岚角两页回信，未用风路或刷新跳过山路。最终 `index-3y2znDdW.js` 已验证投递与开门状态恢复、回访、暂停继续、明信片收取，以及一处风口的预告、安全退回和避风圆内停稳。准确构建与观察范围见 [Edge 记录](docs/qa/1.4.0-alpha.3/edge-observations.json) 和 [验证摘要](docs/validation-1.4.0-alpha.3.json)，完整发布验收仍为 `false`。

最终新档连续三地区、完整风路与轻跃边界、明信片再次刷新后的保留仍待验收；北边界羊角与固定 HUD 的局部重叠、绘本复用猫立绘也留待后续美术改进。详细边界见 [发行准备](docs/release-readiness.md)。

代码提交 `1a127d5eba314108b90a382187be4717feaf6a67` 已推送，已核对本地与远端提交完全一致。[CI 34706678415](https://github.com/Sailero/ShadowLegion/actions/runs/34706678415) 与任务 `103587875756` 的全部步骤成功；[远端证据](docs/qa/1.4.0-alpha.3/remote-ci.json) 已保存。CI 不替代图形、真人体验或 Steam 发行验收。

## 1.4.0-alpha.2 历史基线

alpha.2 的森林与湖区原型通过 326/326 自动检查。[历史 ZIP](release/Sunlit-Echoes-1.4.0-alpha.2-web.zip) 为 10,044,316 字节，SHA-256：`494930700fc200f913feaf6bcfe219f22d0c44b6fca244142b58b7e7fbcaf512`；[包记录](docs/qa/1.4.0-alpha.2/package-verification.json)、[发布清单](docs/release-manifest-1.4.0-alpha.2.json)、[Edge 观察](docs/qa/1.4.0-alpha.2/edge-observations.json) 与 [验证摘要](docs/validation-1.4.0-alpha.2.json) 保留分段运输、最终交信及刷新恢复的准确范围。代码 `e9c7d17fb8117f1c9c6dd92cf0b16a79ffd95106` 的 [CI 34704561741](https://github.com/Sailero/ShadowLegion/actions/runs/34704561741) 成功，见 [远端记录](docs/qa/1.4.0-alpha.2/remote-ci.json)；这些历史结果不作为 alpha.3 的通过证据。

## 1.4.0-alpha.1 历史基线

alpha.1 的首封森林投递原型通过 248/248 自动检查。[历史 ZIP](release/Sunlit-Echoes-1.4.0-alpha.1-web.zip) 为 10,030,567 字节，SHA-256：`283078391483b7252c8f3cc30b4ce299144c8d713212bfea156e9455e3799f5f`；[包记录](docs/qa/1.4.0-alpha.1/package-verification.json)、[发布清单](docs/release-manifest-1.4.0-alpha.1.json)、[Edge 观察](docs/qa/1.4.0-alpha.1/edge-observations.json)、[验证摘要](docs/validation-1.4.0-alpha.1.json) 与 [远端 CI](docs/qa/1.4.0-alpha.1/remote-ci.json) 保留当时的森林交付、返营与最终包恢复检查范围，不作为当前 alpha.3 的验收证据。

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

邮路使用 WASD / 方向键或左键点地行走，Shift / 右键轻跃，E 分工或召回小暖，F 近场互动与交信，Esc 暂停。点地行走需沿可通行路径分段选择，遇到阻挡会停下。绘本使用左右键翻页、R / Home 重看、Esc 合上，菜单可用 Tab + Enter 选择。

在营地打开“旅途设置”，选择“备份旅途”下载 JSON；迁移设备或站点时，先选“恢复旅途”查看已投递地区、安全续玩点与练习记录，再确认恢复。文件不上传；先离开正在运行的邮路或练习再恢复。读取、验证或写入失败会给出明确提示，写入中断会尝试还原原记录。

[故事与旅程](docs/story-and-journey.md) 说明五位收信人、小暖的成长和结局；[五地区实施方案](docs/region-implementation-plan.md) 与 [三小时内容和 Steam 计划](docs/steam-three-hour-plan.md) 保留操作设计、官方作品参考及制作预算，沙原和雪湾仍待实现。[小猫美术记录](docs/mailcat-art-manifest.json) 保存生成提示词与透明度修正；头像、部件和封面位于 [美术资源](src/public/art/)，连贯动作由 [CatSpriteFactory](src/utils/CatSpriteFactory.ts) 分层合成。

## 保留的挑战内容（1.3 历史基础）

四个旧角色 ID 作为棉棉的四套邮装保留。五十段挑战、无尽与影子切磋是可选练习，不代替送信主线；战斗影子采用本机行为统计与规则决策，不是在线玩家或精确录像回放。下方 rc.1 / rc.2 / rc.3 的包和图形记录均为历史证据。

- 五章各十关，共五十个独立关卡：独立名称、地图几何、来路组合、敌人编排与三星目标；包含暖风草地、杏沙小镇、薄荷港湾、花灯集市、晴空花园。
- 战役逐关解锁与重玩；无尽巡游逐站加压；影子切磋五阶各三轮，包含单影到双影的不同节奏。
- 四种守护打法：机动爆发、连射穿透、迟滞护盾、蜜蜂部署；开场改装、波间三选一和局内流派进化。
- 第 3 / 8 / 15 关解锁新伙伴与技能；三项五级基础装备、六项营地研究、每角色七级熟练度与三选一专精。已购专精可免费重配，效果有明确取舍。
- 新档就有见习影伴；之后继承上局习惯，支持同行 / 守营；永久成长、模式纪录、关卡 / 站点起点续玩均在本机保存。
- 原创生成的水粉旅行插画、角色与地面图集，配合旅行书页、邮戳与路线地图；柔和音效、音量、减少动态效果和持续射击设置。

当前理论负载模型中，多数关卡在“初步流派”假设下约为 **30–150 秒活跃战斗，另假设 20–40 秒读卡**。这些是模型预算，不是实测单关时长；正常玩家的成功率、读图时间与完整路线体验仍需试玩验证。

## 挑战模式操作

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
.\scripts\package-web-release.ps1 -ReleaseDirectory ".\release\shadow-legion-web-1.4.0-alpha.3-<timestamp>"
```

脚本输出同一 `release/` 父目录中的版本 ZIP，使用正斜杠条目，并校验源文件与 ZIP 内部 SHA-256；拒绝额外文件、路径穿越、链接、清单不符和覆盖已有包，不改动发布源目录。

这些产物是本机静态网页包；Steam 桌面发行仍需单独完成，体积检查也不代表加载速度或帧率验收。当前与历史包的精确记录见 [发行准备](docs/release-readiness.md)。

`analyze:pacing` 是理论敌人负载模型，不是实测局长。真实试玩会在本机保留最近 120 条已完成波次的有效战斗用时；`SessionMetricsManager.summary()` 返回各章样本数、单波中位数和 p90。数据不上传，小样本也不代表整体平衡或整章时长。

## 1.3 历史包与验证

历史 rc.2 包为 `release/Sunlit-Echoes-1.3.0-rc.2-web.zip`，**3,155,016 字节**，SHA-256：`546D2AEF1B044FDF4BF6B1BE8488580A54D19FA7FF5226825BF10D36E662CC62`。运行内容约 4.48MB、JS gzip 424.62kB；[历史发布清单](docs/release-manifest-1.3.0-rc.2.json) 保存八个文件的校验值。以下结果不代表当前 alpha 的最终图形验收。

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
- [五地区送信实施方案](docs/region-implementation-plan.md)
- [故事与旅程](docs/story-and-journey.md)
- [三小时内容与 Steam 工程计划](docs/steam-three-hour-plan.md)
- [市场、可玩性与局长研究](docs/market-and-playability-research.md)
- [五十关节奏分析](docs/campaign-pacing-v2.md)
- [长期成长、角色专精与经济预算](docs/progression-design.md)
- [绘本美术方向](docs/art-direction-v2.md)
- [发行准备与验收记录](docs/release-readiness.md)
- [静态花园性能对照](docs/render-performance.md)

Phaser 3 + TypeScript + Vite；Electron 为可选桌面封装。项目保留所有权利；运行时开源依赖许可证随发布目录附带。
