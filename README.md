# 暖影同行 / Sunlit Echoes

拟人布偶猫棉棉带着一袋回信，与影伴小暖把远方的朋友重新联系起来。目标是温暖、需要操作与分工的 Steam PC 买断送信冒险，首次完整体验的制作目标约三小时。

当前开发版 **1.4.0-alpha.4** 已接入**风铃森林、圆镜湖、云阶山、晒被沙原四地区可玩原型**。小暖从留守扶桥、稳舟运信、异地接铃，成长到和棉棉牵住同一块遮阳布。地区按真实投递依次开放，旧练习星章不替代主线交信。**晴雪湾、最终回邮局与完整三小时内容仍未完成，尚未达到 Steam 发布就绪状态。**

晒被沙原有三处不同的空间谜题：先把布展开遮住卷叶，再绕过石堆选择合适棚脚，最后让门牌与软垫上的叶片同时乘凉。E 请小暖沿路到位，F 拿起布角，走位改变真实布面，完整遮住目标后再 F 读字；碰石或拉远会温柔放下布角。新增站定持物与边走边牵布动作。详见 [沙原实现记录](docs/desert-implementation.md)。

主旅程内容升级为 **v4**，合法 v2/v3 只读迁移、首次成功修改才落盘；森林 v1 原始记录保留。三个沙原节点、安全续玩点、投递凭据和可选软垫纳入**十域本机备份**。匹配后保存失败可按 F 重试，未确认前不会显示已保存；不是云存档。

**本候选 `release:web` 退出 0：442/442 自动检查、TypeScript、Vite、静态检查及依赖审计通过，0 已知依赖漏洞。** [alpha.4 本机试玩 ZIP](release/Sunlit-Echoes-1.4.0-alpha.4-web.zip) 已通过 .NET 与独立 Python 逐项读回核对，见 [包记录](docs/qa/1.4.0-alpha.4/package-verification.json)、[发布清单](docs/release-manifest-1.4.0-alpha.4.json) 和 [验证摘要](docs/validation-1.4.0-alpha.4.json)。

本轮 Edge 观察仍在进行：协调代理已在中间 `index-DaE4JaA6.js` 从全新主线完成森林三片地址、影伴实际稳桥、步行过桥和 F 交信；刷新到最终 `index-CbuzvzsF.js` 后，1/4 回信保留，地图正确开放湖区，已实际将首船送到中站，安排小暖留守，再沿岸步行将两片导流叶对齐；当前暂停在北岸，第二次发船尚未执行。**本轮湖区后半段、山区与沙原图形流程尚未通过验收。** 最终新档贯通四区、持物动画、十域备份原生往返、持续键鼠手感与真人时长均待验证；准确边界见 [发行准备](docs/release-readiness.md)。

alpha.4 源码与测试已提交并推送：`468ef1e86daa3893b9868811794d7a85b75c18b8`，协调代理已核对远端一致。[CI 34709906328](https://github.com/Sailero/ShadowLegion/actions/runs/34709906328) 及其全部步骤成功，[精确提交证据](docs/qa/1.4.0-alpha.4/remote-ci.json) 已保存；本轮文档与[部分图形观察](docs/qa/1.4.0-alpha.4/browser-observations.json)在随后独立的文档提交中归档。CI 不替代图形或真人验收。

## 浏览器试玩

需要 Node.js ≥22.15，推荐 Node 24。

```bash
npm ci --ignore-scripts
npm run dev
```

打开终端显示的本地地址。生产预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

浏览器版需要 HTTP(S)，不要双击 `dist/index.html`。不同协议、域名和端口不会共享本机存档。

| 邮路操作 | 按键 |
| --- | --- |
| 移动 | WASD / 方向键 / 左键点地 |
| 轻跃 | Shift / 右键 |
| 小暖分工 / 召回 | E |
| 拾取、读字、拿放布角、交信 | F，依近场提示 |
| 暂停 | Esc；暂停后再次 Esc 回邮路图 |
| 回信册 | 左右翻页、R / Home 重看、Esc 合上 |

点地行走是直线目标，需沿可通行路径分段选择，遇到阻挡会停下。轻跃是同平面的短冲刺，没有跳高或越墙能力。设置提供音量与减少动态效果；暂停、失焦和离场会清除未消费的操作请求。

在邮局或其他非活跃邮路入口打开“旅途设置”，可下载 JSON 备份；恢复前先预览已投递地区、安全续玩点及练习记录，再确认。文件不上传，活跃、暂停或休眠的邮路与战斗场景禁止恢复；写入失败会明确提示并尽可能回滚。浏览器备份还不是 Steam 桌面文件存档。

## 内容与成长

| 地区 | 当前操作身份 | 状态 |
| --- | --- | --- |
| 风铃森林 | 寻回三片地址，实际留守扶桥，交信开返程近路 | 已实现；本轮中间构建完成普通流程 |
| 圆镜湖 | 信走水路、猫走岸路；稳舟、调流、两次实际停靠 | 已实现；本轮最终构建仅到起点 |
| 云阶山 | 两种参与顺序的铃声接力，独立伙伴路线，可选风路 | 已实现；本轮最终图形待验证 |
| 晒被沙原 | 共同牵布、绕石换锚、同时遮住两处卷叶 | 已实现；本轮最终图形待验证 |
| 晴雪湾与回家 | 组合已学分工，让小暖承担自己的那段任务 | 仅 [下一阶段方案](docs/snow-prototype-review.md)，尚未实现 |

小暖的成长体现为地区内的新用途、居民回应与新的地址。已有野餐垫、云纹明信片和第六块软垫三项可选发现，不阻挡主信。自由回访与主线体验的重复游玩价值仍需玩家验证，不能仅凭关卡数量宣称耐玩或已达三小时。

十六页序章、回信和终章文本可跳过、回看；文本存在不等于雪湾与结尾已成为可玩内容。[故事与旅程](docs/story-and-journey.md)、[原五地区方案](docs/region-implementation-plan.md) 和 [三小时与 Steam 计划](docs/steam-three-hour-plan.md) 保留研究与制作预算；已落地的具体差异以本版实现记录为准。

## 保留的挑战练习

旧五章五十关、无尽巡游与五阶影子切磋仍是独立可选练习，不参与主旅程解锁。四个旧角色 ID 作为棉棉的四套邮装保留；三项五级基础装备、六项研究、每角色七级熟练度与三套可切换专精有有限消费和真实取舍，见 [成长设计](docs/progression-design.md)。

战斗操作为 WASD 移动、鼠标瞄准、左键射击、Shift / 右键闪避、Space 技能、Q 切换、E 指挥、1/2/3 选卡与 Esc 暂停。战斗影子来自本机行为统计与规则决策，不是联网真人、逐帧录像或训练型自博弈模型。

`npm run analyze:pacing` 只分析旧战斗遭遇的理论负载；约 30–150 秒活跃战斗和 20–40 秒读卡仍是模型假设。[节奏报告](docs/campaign-pacing-v2.md) 及本机波次样本不能外推为送信主线或三小时实测。

## 检查与归档

```bash
npm test
npm run analyze:pacing
npm run check
npm run check:security
npm run release:web
```

`check` 运行逻辑与实际方法回归、TypeScript、生产构建和静态检查；部分测试隔离 Phaser 绘制、输入初始化及物理边界，不是完整浏览器验收。`release:web` 再审计依赖并生成带时间戳的静态目录、部署说明、许可证及 SHA-256 清单，不上传。

Windows 标准 ZIP 归档命令：

```powershell
.\scripts\package-web-release.ps1 -ReleaseDirectory ".\release\shadow-legion-web-1.4.0-alpha.4-<timestamp>"
```

脚本校验源文件和 ZIP 内部哈希，使用正斜杠条目，拒绝覆盖已有包。当前产物仍是静态网页；旧 EXE 和现存 Electron 命令不代表 alpha.4 已有验收合格的 Steam 桌面发行物。

## 历史证据与文档

下列记录仅对应当时版本；精确构建、图形范围、包与 CI 均保留在原摘要中。

| 历史版本 | 记录 |
| --- | --- |
| alpha.3：山区加入 | [验证摘要](docs/validation-1.4.0-alpha.3.json)、[Edge 观察](docs/qa/1.4.0-alpha.3/edge-observations.json)、[远端 CI](docs/qa/1.4.0-alpha.3/remote-ci.json) |
| alpha.2：湖区加入 | [验证摘要](docs/validation-1.4.0-alpha.2.json)、[Edge 观察](docs/qa/1.4.0-alpha.2/edge-observations.json) |
| alpha.1：森林切片 | [验证摘要](docs/validation-1.4.0-alpha.1.json)、[Edge 观察](docs/qa/1.4.0-alpha.1/edge-observations.json) |
| 1.3 挑战系统 | [rc.3](docs/validation-1.3.0-rc.3.json)、[rc.2](docs/validation-1.3.0-rc.2.json)、[rc.1](docs/validation-1.3.0-rc.1.json) |

- [产品总纲](docs/project-master-plan.md)与[发行准备](docs/release-readiness.md)
- [沙原实现](docs/desert-implementation.md)与[山区实现](docs/mountain-implementation.md)
- [三小时内容与 Steam 工程](docs/steam-three-hour-plan.md)
- [本机保存恢复设计](docs/save-recovery-design.md)
- [布偶猫美术记录](docs/mailcat-art-manifest.json)、[生成素材清单](docs/art-generation-manifest.json)、[运行资源](src/public/art/)、[生成原图](art/source/)

Phaser 3 + TypeScript + Vite；Electron 为尚需完善验收的桌面封装。项目保留所有权利；运行时开源依赖许可证随发布目录附带。第三方游戏参考图没有作为游戏素材发布。
