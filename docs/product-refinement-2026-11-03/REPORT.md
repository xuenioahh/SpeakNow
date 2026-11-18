# SpeakNow · 界面、Daily 摄像头反馈与用量成本

2026-11-03。正式项目：`omniverse-ent208`。源码及正常预览：`/Users/zhangzhuoru/Desktop/master/speaknow-audit`，[localhost:5173](http://localhost:5173)。不替换其他副本，不扩大账户或管理员权限。

本报告承接 [Daily 实现与真实验收记录](../daily-conversation-2026-11-01/README.md)。自然多轮、记忆、语音状态机和摄像头检测的根因分析、模型和实际采样详见该记录。

## 线上 Daily 启动故障：当前状态

2026-11-03 补充：此前发布状态不代表 Daily 可用。使用生产部署环境进行存储预检，确认 `app_memberships`、`app_usage_ledgers` 缺失（PGRST205），`speaknow_commit_usage`、`speaknow_release_limit` 缺失（PGRST202）。其余基础表及 consume_limit 可访问。Start 的会员额度检查因此失败；旧提示错误地只指向 consolidation.sql。

必须在现有生产 Supabase 执行 [membership_20261029.sql](../../supabase/membership_20261029.sql)。本机具备 Vercel 发布权限，但尚无 Supabase SQL 管理登录；**迁移尚未在线上执行，Daily 故障尚未修复上线**。没有关闭额度校验、扩大会员权限或启用本地存储回退。

待发布改动：启动失败提示显示在准备页；启动中禁用按钮并取消离页请求；后台隐藏内部 SQL 路径并保留安全错误码；生产构建增加 10 张表和 3 个 RPC 的无数据写入预检。新诊断部署因四项缺失而被阻止，未切换生产域名。迁移完成后必须重新预检、构建、发布，并验证线上 Start。

本次验证：179 项单元测试通过；真实本机 PostgreSQL 6 项迁移、权限和并发检查通过；typecheck、lint、build 通过。浏览器 `--start-recovery` 验证首次 503 可见、失败不打开麦克风、重试防重复、恢复后三轮对话及结束释放媒体。语音识别、配音和 LLM 为受控 fixture，不是线上或真人验收。

## 界面与用户路径

全站采用纸白底、深色文字、低饱和绿色主操作、适量留白及小圆角。去掉首页装饰序号、冗余导航、准备页重复步骤说明、登录背景光团，统一考试、题库、Daily 场景列表、历史、会员、账户、Presentation、Expression 和管理员页的排版、控件和颜色。实际检查了桌面、390px、320px；补查了手机场景列表底部可滚动访问。没有重建网站、考试或存储系统。

Daily 场景保持挂载，字幕仍在桌面侧边和手机下方。3D Orb 保留在控制区，桌面32px、窄屏26px；不覆盖场景。之前移除的隐藏句子说明、`Browser voice` 标签及原始 fallback 信息未重新引入。

摄像头反馈的位置和步骤：

1. **开始前**：既有 Camera 设置弹窗中可选择预览，检查脸和肩膀的构图与光线。可选本机视觉分析与本机视频片段；打开摄像头不是练习前提。针对摄像头的重练先回到准备页，并打开该设置，开始前仍可关闭。
2. **练习中**：只保留小预览，后台持续分析，不展示七张评分卡。
3. **结束后**：同一 Feedback 页分为 **Conversation → Camera review → Next practice**。对话回顾突出摘要、语言特点及摄像头回顾入口；摄像头页提供七项可用性、Camera/Audio 时间轴、对应原话、已有录音定位播放、真正存在且重叠的本机视频片段，以及单一练习建议。Next practice 最多三个有证据的重点，可重练或比较之前的尝试。

只显示实际观测，不用“动作越多越好”或情绪、自信度分数。缺失维度标记 Not assessed。音频和视觉同一时段重叠不会被解释成因果。没有保存原视频时，反馈不伪造视频回放。

## 修改文件

| 文件 | 改动 |
|---|---|
| `src/product-refinement.css`、`src/main.jsx` | 全站视觉统一，桌面和手机布局，紧凑时间轴控件 |
| `src/pages/MainLanding.jsx`、`Home.jsx`、`ExamSpeaking.jsx`、`ExamPreparation.jsx`、`AuthPage.jsx`、`Membership.jsx` | 去除重复装饰、说明和内部实现文案 |
| `src/pages/VoiceChat.jsx` | 复用既有摄像头预览完成开始前构图检查；摄像头重练准备流程 |
| `src/components/DailyFeedbackPage.jsx` | 三步反馈，已有摘要、录音、保存、删除、比较和重练动作；键盘切换步骤 |
| `src/components/DailyCameraReview.jsx` | 七维可用性、实际事件时间轴、原话与音频对齐、针对片段重练 |
| `src/components/LearningAudio.jsx`、`src/pages/LearningReview.jsx` | 复用已有播放器，按事件定位；复用原反馈及保存逻辑 |
| `api/_requestContext.js`、`api/_llm.js` | 每次真实调用的 provider/model、输入输出、缓存命中/未命中；累计 SSE usage 去重 |
| `api/dynamic-tts.js` | 记录实际接受的字符数和配音 provider/model，非供应商账单 |
| `api/_membership.js`、`_membershipStore.js` | 同一个既有账本追加每次尝试的用量，保留失败成本；幂等重放不再请求供应商；标记 fixture |
| `api/_usageReport.js`、`api/membership.js` | 管理员汇总，时间范围、模型/功能/日期/匿名账户参照、TTS 模型、缺失覆盖；不输出转写和对话 |
| `shared/usagePricing.js`、`src/components/AdminUsage.jsx`、`src/pages/AdminPage.jsx` | 版本化价格快照、月费和分钟充值计算器、统计导出 |
| `.vercelignore` | 忽略整个目录，采用干净目录及逐文件上传，排除本机数据、文档、测试、环境配置 |
| `tests/learning/usage-costs.test.mjs`、`product-refinement-browser.mjs`、相关 Daily/全站测试 | 真实账本、授权、失败重试、Mock 排除、价格边界、反馈路径与布局回归 |
| `scripts/verify-usage-real.mjs` | 一次真实反馈调用，核对新用量仪表；复用已有24轮真实对话收据 |

## 实际 Token 与成本

新统计位于管理员 `/admin` → **Usage & pricing**。用户练习界面不显示 Token 仪表。统计从既有用量账本读取，按1–90天过滤，最多扫描1,000个账本，达到上限明确显示部分结果；账户列表最多显示费用估算最高的100项。访客调用也计入。失败、取消和重试的真实供应商收据保留，成功请求的幂等重放不产生新费用。历史覆盖缺失、未知模型、没有返回 usage 的请求不按免费处理，无法据此自动推定利润。

[真实用量核对](real-usage.json) 使用之前24轮真实 `deepseek-flash` 文本会话及本次新请求的 `deepseek-v4-pro` 反馈。未使用 Mock；这不是全站累计收入/成本或真人语音会话。

| 项目 | 输入 Token | 输出 Token | 按空闲至高峰价格估算（CNY） |
|---|---:|---:|---:|
| 24轮真实对话 | 28,144 | 1,211 | 0.016806–0.033612 |
| 1次真实反馈 | 6,841 | 566 | 0.038426–0.076851 |
| 合计 | 34,985 | 1,777 | **0.055232–0.110463** |

缓存命中16,512 Token，未命中18,473 Token；25/25次有完整 Token 收据。新反馈 HTTP200，耗时约8.28秒。价格快照按 [DeepSeek 官方价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 于2026-11-03核对，展示空闲/高峰区间，不尝试猜测节假日峰值时段。这是价格估算，不是充值余额或供应商扣款对账。

24条实际回复共5,541个 JavaScript 字符。本次没有提交到付费 TTS，实际付费 TTS 计数为0；**如果**全部提交给公示 Flash/Turbo 配音，按 [ElevenLabs 官方 API 价](https://elevenlabs.io/pricing/api) $0.04/千字符约为 $0.22164，尚未换算人民币或计入套餐差异。该金额仅为假设，不能当成已发生支出。浏览器原生 ASR/TTS 没有可供本站核对的供应商账单。

## VIP 定价方法

计算器同时提供月费及分钟充值等价价格。需填写或确认：每月 Daily 分钟、模型每分钟成本（可显式替换实测样本）、付费配音字符率与合同价、汇率、ASR/其他每分钟费用、服务器/数据库/订阅月成本、预计付费人数、免费用户补贴、考试/退款/税等每人费用、风险准备、支付费率和目标毛利。未填写的必要成本不自动视为0。

`价格 =（模型/语音变量成本 + 考试等成本 + 分摊基础设施与免费用户费用）×（1 + 风险准备）÷（1 − 支付费率 − 目标毛利）`

分钟充值按同一月度成本分摊到包含分钟数。使用者仍需确认这个成本分摊方式适合实际套餐。计算器不修改公开价格，不开启支付，不另外建立会员或扣费系统。

当前VIP权益含180分钟 Daily 和考试额度，不能仅用一次文本会话成本决定会员售价。已准入会话允许超过初始时长和产品AI额度，两小时 reservation 仍为服务边界；长上下文、失败重试和超额收尾需纳入风险。未测量的考试语音、基础设施、汇率、税费与退款使得现在无法给出“必然不亏”的唯一售价。

## 验证范围

- 最新完整 `npm test`：**175通过，0失败**；typecheck、lint、生产build通过。
- [页面与后台浏览器核查](browser.json)：12类页面各三个宽度，外加管理员统计、计算器输入、访客401拒绝；页面运行错误0。截图为真实浏览器，数据后端为隔离 fixture。
- [全产品回归](../full-product-2026-10-31/browser-results.json)：8组通过，覆盖TOEFL隐句、考试模式、IELTS三部分、录音质量、Daily暂时故障恢复、VIP试用及管理员授权、配音降级与取消。ASR/TTS/LLM输出为受控数据。
- [摄像头反馈浏览器验证](../daily-conversation-2026-11-01/evidence-browser.json)：七维、时间重叠、证据校验、录音定位、摄像头重练设置、320/390布局；事件和音频为受控 fixture，没有冒充真人。
- [连续语音回归](../daily-conversation-2026-11-01/continuous-browser.json)：三轮自动恢复收听，真实WebAudio/VAD/MediaRecorder/SSE/IndexedDB；ASR/TTS/LLM事件受控，没有同时录下TTS，结束后媒体轨道释放。
- 实际物理摄像头模型和数据沿用前次验收：Face/Pose/Hand Landmarker，在 Worker 中处理真实帧；12个有效人脸和上半身样本，手部0、长期一致性样本不足，均没有虚构分数。935个渲染帧间隔中位数/P95为16.7ms，桌面样本不能外推所有手机。
- 真实24轮模型首Token中位数638ms、P95 921ms；完成中位数1259ms、P95 1558ms。不是人声结束到播放的整体延迟。

仍未完成真人物理麦克风多轮与逐动作摄像头准确率验收、同一次真人音视频综合反馈验收、播放期间纯语音双工打断验收。点击麦克风可打断TTS。Azure发音/语调未配置，不能用文字代替声学判断。上述功能和数据覆盖缺口均保留明确的未评估状态。

## 发布

最终版本、正式域名指向、清理状态和网络验证结果见本目录 `deployment.json`。Vercel 构建/生产指向可通过其 API 核对；本机及网页读取工具对 `*.vercel.app` 访问超时，因此不能将平台READY误称为已完成线上真人体验验收。

发布时发现 CLI 压缩上传会保留被忽略的目录项，连带目录内容。旧上传的部署源码权限为非公开，但包含多余目录；已修改排除规则，改从 [363个发布文件的干净目录](clean-release-manifest.json) 逐文件上传，并清理本次生成的两份多余压缩部署。没有轮换或改写已有生产密钥。
