# 布偶猫送信冒险：开发与发行准备

更新：2026-09-13。当前开发版 **1.4.0-alpha.4**。目标为 Steam PC 买断、温暖的布偶猫送信冒险，首次完整体验约三小时。当前有森林、湖、山、沙四地区可玩代码；**晴雪湾、最终回邮局和完整三小时内容仍未完成，不能称为 Steam 发布就绪。** 本表把实现、自动检查、普通图形操作、硬件性能和真人体验分开记录。

## 当前候选与自动检查

| 项目 | 当前实际结果 | 证据与边界 |
| --- | --- | --- |
| 完整发行命令 | `npm run release:web` 退出 **0** | [实际命令记录](qa/1.4.0-alpha.4/release-execution.json)、[完整日志](qa/1.4.0-alpha.4/release-checks.log) |
| 自动测试 | **442/442，通过；失败、跳过、取消均 0** | 包含真实管理器、模型与场景方法；部分测试隔离绘制/音频/输入初始化/物理坐标，不是完整浏览器或真人验收 |
| 构建与静态检查 | TypeScript、Vite、`check:dist` 通过 | 8 个运行文件；资源路径与包内容检查不能代替帧率或加载性能 |
| 依赖审计 | **0 已知依赖漏洞** | 当时 `npm audit` 输出；不是所有应用安全或发行许可检查 |
| 标准 ZIP | 11 个清单文件 + 清单自身，共 **12 条** | .NET 创建/读回与独立 Python 逐字节核对，全部匹配发布目录、dist、清单；正斜杠路径 |
| Git / 当前 CI | 源码与测试提交 `468ef1e86daa3893b9868811794d7a85b75c18b8` 已推送并核对远端一致；当前 CI **success** | [精确提交证据](qa/1.4.0-alpha.4/remote-ci.json)、[运行34709906328](https://github.com/Sailero/ShadowLegion/actions/runs/34709906328)，任务103596647614全步骤成功；本文及部分图形记录在随后独立文档提交中归档 |

最终目录：`release/shadow-legion-web-1.4.0-alpha.4-2026-09-12T17-50-55-453Z/`。运行内容 **8 个文件、11,601,825 字节**；JS `assets/index-CbuzvzsF.js` 为 **1,926,501 字节**，Node v24.16.0 默认 `zlib.gzipSync` 为 **493,467 字节**。

标准 [Sunlit-Echoes-1.4.0-alpha.4-web.zip](../release/Sunlit-Echoes-1.4.0-alpha.4-web.zip)：**10,069,730 字节**，SHA-256：`64afc1c09bd5f5cdb0215893cf8a0711dab310edd2ccf8883e7d993cc457346f`。[逐项包核验](qa/1.4.0-alpha.4/package-verification.json)、[发布清单](release-manifest-1.4.0-alpha.4.json)、[验证摘要](validation-1.4.0-alpha.4.json)

日志中的 Vite 单包超过 500kB 建议被 PowerShell 包装为 `NativeCommandError` 文本，但本次 npm **整体退出 0**，后续静态检查、审计与目录生成成功。该提示不能误记为构建失败，也不能因此忽略未来加载性能工作。

## 本轮实现与图形证据分界

| 范围 | alpha.4 已实现 | 本轮实际图形状态 |
| --- | --- | --- |
| 四地区主旅程 | 森林→湖→山→沙依真实交付开放；雪区锁定 | 中间构建完成森林，最终构建恢复、首船到湖中站并步行对齐两叶；其余流程待下表 |
| 三处遮阳谜题 | 实际伙伴到位、拿布、连续走位覆盖、换棚脚绕石、双目标同时覆盖，F 才读字 | 场景/模型回归通过；**沙原普通图形操作尚未验收** |
| 持物动作与沙原绘本 | `hold` 站定扶布、`carry` 持布行走，布角连接猫爪；奶油沙路、石堆、晾布与团刺 | 自动动作检查及实际 draw 方法回归通过；真实方向、动态、遮挡与舒适度待验收 |
| v4 与十域备份 | 严格兼容 v2/v3，三节点与四安全点，拒写/读回/幂等；备份预览含沙原 | 数据回归通过；当前版本原生文件 UI 完整往返尚未验收 |
| 待存成功 | 匹配后放下布角，失败保持 pending；F 只重试，不同帧交信，E 不取消 | 实际 Scene 测试确认不自动重写、不绘制跨地图长布；不是原生浏览器故障注入证据 |
| 主线故事 | 十六页文本与既有四地区凭据解锁；团刺两页按实际交付开放 | 本轮只观察到最终首页 1/4 回信保留；沙原回信、完整翻阅和剩余剧情待验收 |

截至本次回填，协调代理报告的 Edge 范围为：

1. **中间 `index-DaE4JaA6.js`**：从全新主线找齐森林三片地址；小暖实际到风铃石稳定桥；棉棉步行过桥，在栗笺门前 F 交信。
2. **最终 `index-CbuzvzsF.js`**：重载后保留 1/4 回信，地图正确开放湖区；已实际完成首船到中站，小暖留守中站；棉棉沿岸分别转动西叶向东、北叶向北，并完成可选野餐垫互动。当前在北岸暂停，尚未回到中站执行第二次发船。

[本轮 Edge 观察](qa/1.4.0-alpha.4/browser-observations.json)已归档；截图在会话中目视检查，没有另存图片。最终构建启动时一次 warning/error 日志读取为空，不推广为全程零异常、FPS、完整键盘手感或沙原/山区通过结论。alpha.3 的山区和 alpha.2 的湖区观察只保留历史范围，不能填补本次候选的未测项。

## alpha.4 具体待验证项

| 待验证项 | 要完成并留下的证据 | 当前状态 |
| --- | --- | --- |
| 最终森林完整首通 | CbuzvzsF 新档寻片、真实稳桥/过桥、交信、回程；现首通发生在中间 DaE4JaA6 | 待验证 |
| 最终圆镜湖 | start 发船、实际中转保存、第二段改流/到信箱、F 交付、回信与重载保留 | 首船到中站、两叶对齐；第二次发船前暂停 |
| 最终云阶山 | 从山脚观察并完成两种接铃、错误铃恢复、沿实际主路穿门、岚角交付与重载 | 本轮尚未验证；alpha.3 是历史证据 |
| 最终晒被沙原 | E 后小暖走到棚脚、F 拿角、牵布动作、三处不同谜题、西错锚召回重派、团刺交付与回信 | 本轮尚未验证 |
| 沙原取消与保存失败 | 拉远/碰石释放、拾角优先、暂停/失焦、待存提示、不拉长布、F 重试、重载只恢复确认节点 | 方法回归通过；原生图形边界待验证 |
| 四区连续与回访 | 同一新档连续完成四区，正确回信计数、下一地区开放与雪区保持锁定；回访不重复交付 | 待验证 |
| 十域 v4 备份 UI | 原生下载、选择文件、预览、取消不写、确认往返、缺项保留、活跃地区禁恢复与失败提示 | 数据回归通过；当前原生流程待验证 |
| 猫动作与可读性 | hold/carry 与正常移动切换、各方向、减少动态、长文本、不同视口下猫/布/目标/HUD不互挡 | 待实际图形及真人复核 |

## 从原型到 Steam 成品的五项门槛

1. **完整内容与结尾**：制作晴雪湾实际操作、交信及可中断恢复的最终回邮局节点；五区与结尾从新档走通，结局后仍可回访。[雪湾设计评审](snow-prototype-review.md) 是待实施方案，不是新关卡；十六页文字与旧五十关不算可玩完成。
2. **可控时长、成长和重玩价值**：记录该版本首次游玩的探索、挑战、对话、可选路线、求助和停顿墙钟；验证小暖能力变化可被玩家理解，回访与可选发现有吸引力。三小时、山地 8–12 分钟及雪湾 10–15 分钟均未由真人样本确认；不靠等待或数值填充。
3. **PC 原生交付与存档**：完成受限桌面文件存档、旧浏览器迁移、离线重启/升级和恢复；重新制作并验收桌面包。旧 EXE、当前 Electron 依赖与静态 ZIP 不是 Steam 成品；Steam Cloud、Steam Deck、macOS 与 Linux 不承诺已支持。
4. **输入、可访问性与性能**：完成手柄全流程、重绑、设备提示切换，验证键鼠持续/短按、静音图形信息、减少动态、字幕/英文与缩放可读性；在参考硬件普通窗口测持续帧耗时、内存及加载，验证窗口/全屏/多显示器/原生 DPI。
5. **发行材料与审核**：按计划平台完成字体、美术、音频、依赖、名称和对外素材的许可审阅，制作准确商店资料，再准备平台审核。本轮不设价格、不办理账号、不购买服务器、不上传；哪些是 Valve 流程、哪些是本作质量目标，见 [Steam 工程计划](steam-three-hour-plan.md)。

`fullReleaseAcceptance=false`。自动检查与归档通过，不改变上述未完成状态。

## 浏览器、设备与体验矩阵

| 环境/主题 | 可使用的证据 | 本次未覆盖范围 |
| --- | --- | --- |
| Edge / Windows | 本轮中间森林首通、最终恢复与湖 start，范围见上文 | 其余最终普通流程、精确环境档案、全键盘/鼠标持续手感 |
| Chrome / Firefox / Safari | 无 alpha.4 对应原生验收；历史 Electron 不是这些浏览器 | 若计划支持，逐浏览器验证输入、字体、音频、Canvas和存档 |
| Electron / 原生桌面 | rc.1/rc.2 隔离 Chromium 历史报告 | alpha.4 桌面包、文件存档、窗口全屏与操作系统行为 |
| 视口与 DPI | 历史 rc.2 视口及 CDP DPR 1.5 有记录 | 当前四区、绘本和备份；CDP 仿真不能冒充 Windows 系统 150% 缩放 |
| 性能 | 历史 rc.2 缓存版持续运行有逐段采样 | 当前主旅程普通窗口、参考配置、加载/帧耗时与内存；包 gzip 不代替 FPS |
| 旧三练习模式 | 自动检查包含旧系统；历史加速五十关/无尽/影子报告保留 | 当前版本普通玩法、经济节奏、任务负担与用户重玩意愿 |
| 真人体验 | 尚无本版首次完整体验样本 | 全程墙钟、迷路/求助、手感、听感、疲劳及成长理解 |

## 可复现检查与静态交接

```powershell
npm ci --ignore-scripts
npm test
npm run typecheck
npm run check
npm run check:security
npm run release:web
.\scripts\package-web-release.ps1 -ReleaseDirectory ".\release\shadow-legion-web-1.4.0-alpha.4-<timestamp>"
```

沙原场景定向回归：

```powershell
node --import ./scripts/test-loader.mjs --test src/test/desert-scene.test.mjs
```

本轮该文件独立 **19/19** 通过，已包含在总数中，不能再次加到 442 上。它调用实际 DesertScene、继承的伙伴更新、PairedCover 和 Journey；绘图调用被记录而非输出 GPU 图像，提供的坐标序列不等于真实键盘或物理世界。

静态目录需要 HTTP(S)；采用目录内 `DEPLOY.md`，保持 HTML 与哈希脚本同版本。保留旧包供回滚，避免混用中间 DaE4JaA6 与最终 CbuzvzsF。浏览器数据按 origin 隔离，迁移前先从旧 origin 导出，再在新 origin 预览并确认恢复。备份容器为 v1、十域白名单；内部主旅程为 v4，支持合法 v2/v3；旧缺失域保留当前记录，不读取其他 origin 键，也不上传。

`analyze:pacing` 只分析练习战斗负载。38/52/94 活跃分钟、单关 30–150 秒与20–40秒读卡都是模型；最近120条本地波次样本记录模拟活跃时间，不等于主线墙钟或三小时内容。[节奏报告](campaign-pacing-v2.md)、[时间预算](steam-three-hour-plan.md)

## 美术、许可与表达边界

运行素材在 [src/public/art](../src/public/art/)，原图在 [art/source](../art/source/)；猫图集姿势由 [CatSpriteFactory](../src/utils/CatSpriteFactory.ts) 分部位生成，沙原地面由 [desertPaint](../src/ui/desertPaint.ts) 缓存绘制。[猫美术记录](mailcat-art-manifest.json)、[生成来源清单](art-generation-manifest.json) 及发布 `ARTWORK.json` 保留来源与用途。第三方游戏图片只用于研究，没有放进发行素材。

本机规则影子不宣传为训练 AI 或在线真人；本机备份不宣传云存档。最终商店截图应来自接受验收的构建；旧 EXE 和历史图形不能充当新版交付。许可、商标和商业宣传审核未完成。

## 历史证据索引

以下均只代表对应历史版本。原摘要保留精确产物、构建切换、测试、GUI/CI及未测范围；不重复推导为 alpha.4 通过。

| 版本 | 历史范围与证据 |
| --- | --- |
| **1.4.0-alpha.3** | 389/389 与山区加入；[摘要](validation-1.4.0-alpha.3.json)、[清单](release-manifest-1.4.0-alpha.3.json)、[包](qa/1.4.0-alpha.3/package-verification.json)、[Edge](qa/1.4.0-alpha.3/edge-observations.json)、[CI 精确 1a127d5](qa/1.4.0-alpha.3/remote-ci.json)。CUa5r551 中间版两段主路接力交信，3y2znDdW 最终版恢复/回访及部分可选风路；不是最终新档全程 |
| **1.4.0-alpha.2** | 326/326 与湖区加入；[摘要](validation-1.4.0-alpha.2.json)、[清单](release-manifest-1.4.0-alpha.2.json)、[包](qa/1.4.0-alpha.2/package-verification.json)、[Edge](qa/1.4.0-alpha.2/edge-observations.json)、[CI](qa/1.4.0-alpha.2/remote-ci.json) |
| **1.4.0-alpha.1** | 248/248 与森林、故事、猫动作；[摘要](validation-1.4.0-alpha.1.json)、[清单](release-manifest-1.4.0-alpha.1.json)、[包](qa/1.4.0-alpha.1/package-verification.json)、[Edge](qa/1.4.0-alpha.1/edge-observations.json)、[CI](qa/1.4.0-alpha.1/remote-ci.json) |
| **1.3.0-rc.3** | 159/159 与保存补偿；[摘要](validation-1.3.0-rc.3.json)、[清单](release-manifest-1.3.0-rc.3.json)、[Edge](qa/1.3.0-rc.3/edge-observations.json)、[CI](qa/1.3.0-rc.3/remote-ci.json)、[恢复设计](save-recovery-design.md) |
| **1.3.0-rc.2** | 108/108 与八域备份、无尽修复；[摘要](validation-1.3.0-rc.2.json)、[清单](release-manifest-1.3.0-rc.2.json)、[备份](qa/1.3.0-rc.2/backup.json)、[焦点](qa/1.3.0-rc.2/settings-focus.json)、[五十关](qa/1.3.0-rc.2/campaign-flow.json)、[影子拒写](qa/1.3.0-rc.2/shadow-save-failure.json) |
| **1.3.0-rc.1** | 84/84 与五十关、成长、三模式；[摘要](validation-1.3.0-rc.1.json)、[清单](release-manifest-1.3.0-rc.1.json)、[生产流程](qa/1.3.0-rc.1/production.json) |
| **1.2.0-rc.1** | 47项与旧四章基础；[清单](release-manifest-1.2.0-rc.1.json)，不含后续五十关或送信地区 |

rc.2 的 [初次持续运行失败](qa/1.3.0-rc.2/soak-initial-failure.json) 曾暴露满卡转场停第0波；[修复后短测](qa/1.3.0-rc.2/endless-regression.json) 与 [缓存版1207秒报告](qa/1.3.0-rc.2/soak-cached.json) 保留真实顺序。二十分钟报告早于最后营地固定修复；[修复前](qa/1.3.0-rc.2/core-anchor-before.json)/[修复后](qa/1.3.0-rc.2/core-anchor-after.json) 另有定向证据。隔离 Electron、加速流程和注入档案不是原生目标浏览器、真人成绩或当前送信主线的性能认证。[历史性能对照](render-performance.md)
