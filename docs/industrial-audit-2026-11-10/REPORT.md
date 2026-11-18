# SpeakNow 工程审计、修复与 VIP 用量交付

审计窗口：2026-11-10—2026-11-12；证据目录按开始日期保留。项目：`/Users/zhangzhuoru/Desktop/master/speaknow-audit`。

## A. 执行结论

**工程评级：Functionally usable but unreliable（功能已可用，但仍有可靠性缺口）。不能据此宣布可生产上线。**

- 已实际修改实现，而非只给建议：请求超时/错误解析、LLM 取消、摄像头推理健康状态、存储归属标识、用量模块归因、Supabase 请求超时与脱敏、兼容依赖更新，以及本轮新增 VIP 个人用量、充值审核申请、本地无限配额测试账号。
- 已用真实 DeepSeek 完成连续 10 轮文字对话及最终反馈：能够转移话题、接受事实纠正并回忆早期偏好。另做受控语音链路 10 轮回归，二者不是同一种证据。
- 已运行真实摄像头帧与真实 Face/Pose/Hand 模型推理；12 个样本有面部/上身观察，未观察到手部。没有把模型已加载、静态测试图或心理状态推断冒充真人动作分析成功。
- 仍有实证缺口：80 回答长会话反馈请求被 413 拒绝；Supabase 未配置；真人 ASR→TTS 可听闭环未验收；仍有 1 项 high 依赖告警；生产部署与跨实例容量未验证。
- 未部署、未创建 Git 分支或提交、未写生产数据库、未购买服务、未伪造支付或给用户写入虚构 token 消耗。

### 工作区与数据边界

该目录不是独立的已跟踪 Git 仓库；Git 根位于用户主目录，项目 scoped status 为 `?? ./`。因此不能声称有可用的历史 commit diff。改动前保存 `baseline-files.json` 和 `/private/tmp/speaknow-audit-20261110-before/` 原文件快照；VIP 补充修改前另存 `/private/tmp/speaknow-vip-20261112-before/`。

常规预览由本目录 `scripts/start-local.mjs:1` 启动：`http://localhost:5173`，后端 8787，数据在本目录 `data/`。前一轮审计使用独立的 5240/8840 fixture 与 5241/8841 real-API 临时数据服务，没有把测试账号写入原业务数据。用户追加创建测试账号后，才在常规本地 `data/` 中新增一个 learner 账号及其会员账本；不修改其他账号或云端数据库。

## B. 实际架构与侦察结果

```text
用户浏览器
 ├─ React / Vite → src/main.jsx → src/App.jsx
 │   ├─ Daily: src/pages/VoiceChat.jsx → VoiceInteraction
 │   │   ├─ VoiceCapture / AudioTake → WebAudio / MediaRecorder
 │   │   ├─ 浏览器 SpeechRecognition 或可选本地 ASR
 │   │   └─ conversationStream → HTTP/SSE → speaking-feedback(conversation_stream)
 │   ├─ Academic: ExamPreparation / ExamPractice → 题库 / 录音 / review
 │   ├─ Three.js 场景、NPC、Orb；保留原界面和挂载生命周期
 │   └─ CameraPreview → 本地 Worker → Face/Pose/Hand Landmarker
 │       → VisionTimeline 连续特征 → dailyEvidence 紧凑观察摘要
 ├─ IndexedDB / localStorage: 本地尝试、录音与恢复草稿
 └─ Node backend/server.js（本地）或 server/api.js（Vercel）
     → 认证/CSRF/来源检查/限流/幂等/会员账本
     → api/voice-chat.js 的 handler → api/_llm.js → DeepSeek
     → 文本反馈 + 可选设备观察摘要 → speaking-feedback
     → 浏览器 TTS / 可选 ElevenLabs、Azure Speech
     → 自定义账号/用户归属存储 → Supabase REST 或本地 JSON
```

当前版本：React 18.3.1、Vite 6.4.6、Three 0.171.0、MediaPipe Tasks Vision 0.10.22-rc.20250304、Azure SDK 1.53.0。`package.json` 未改，锁文件只做兼容范围更新，没有新增依赖或大版本升级。`inventory.json` 保留文件清单、21 个 API 路由及导入依赖、66 个环境变量名称/是否配置、版本和改动清单；这不是对每个历史页面逐行穷举证明。

### API 与权限边界

| 入口组 | 路由 | 实际边界 |
| --- | --- | --- |
| 公共能力 | `voice-capabilities` | 仅能力元数据 |
| 试用推理 | `speaking-feedback`、`exam-examiner`、`dynamic-tts` | 游客限流；有会话时走鉴权与配额路径 |
| 本地语音 | `local-transcription` | loopback/本地 ASR 开关及会话条件 |
| 账号/题库/会员/音频 | `local-data`、`membership`、`question-bank`、`speaking-audio` | 按 action 检查账号、管理员、来源、CSRF、归属 |
| 受保护业务 | `voice-chat`、`speaking-practice`、`learning-dashboard`、`admin-track`、`expression-review`、`expression-service` | shared protected API guard；管理动作另查管理员 |
| Presentation | `presentation-analysis`、`presentation-impact`、`presentation-media`、`presentation-pause-feedback`、`presentation-practice`、`presentation-report` | 受保护 API；未逐一完成真人端到端验收 |

自定义认证不是 Supabase Auth：`api/_auth.js:1` 使用 scrypt、随机 session、HttpOnly/SameSite cookie、CSRF 校验。后端 service-role 访问 Supabase，客户端不能获得该 key；用户归属需要后端过滤，因为 service-role 可绕过 RLS。SQL 中有 RLS/revoke 设置，但没有实时数据库证据证明部署已应用。

### 对话、视觉与反馈实际实现

- `api/voice-chat.js:7` 将归一化后的 user/ai 历史作为带角色的文本证据放入模型 user 消息；不是把每个历史项直接作为原生 Chat API message。system prompt 把场景定义为开端而非固定清单，允许转话题、事实修正和持续聊天。没有为让结果好看而换成固定回答。
- `shared/conversationMemory.js:2` 保留近期对话并提取较早的真实片段；有长度管理，不是无限上下文承诺。`api/_llm.js:185` 为 SSE 请求使用 usage 回执、320 输出 token 上限、20 秒默认超时。未仅靠提高 temperature 修饰机械回复。
- `src/lib/visionTimeline.js:6` 跨帧聚合可见性、头部方向/变化、肩部姿态、手部位置/变化等代理指标。面部朝向不是可靠眼神追踪，也不能证明情绪、信心或心理状态。
- `src/pages/VoiceChat.jsx:268` 保存 `buildDailyEvidence(...)` 结果；`api/speaking-feedback.js:73` 确实将 `multimodalEvidence` 放进反馈上下文。语言纠错限定真实回答引用，视觉建议限定提供过的证据 ID。没有逐帧向 DeepSeek 上传视频。
- 真实十轮文字反馈的 pronunciation/score 为 null，未评价摄像头行为。物理摄像头测试与该真实反馈测试是分开的，不能合并声称“真人多模态反馈端到端通过”。

### 重复逻辑、兼容与未清理部分

本地 `backend/server.js` 与 Vercel `server/api.js` 是两个适配入口，共享业务 handlers；`speaking-feedback` 转发 Daily action 与独立 `voice-chat` 共存。旧 Presentation/CasualVideo/VoiceReport 路由仍在，不能仅凭名称判为死代码后删除。存储同时存在 IndexedDB、本地 JSON、Supabase 三层，之前混用 cloudSaved 语义已修正。重复 Supabase fetch 改为复用有界的 securityRequest，保留缺失可选 settings 表的兼容行为。其余兼容路由未做大规模清理。

## C. 问题登记

状态只使用 Fixed / Partial / Blocked。没有把未复现的猜测登记为已修复。

| ID / 优先级 / 模块 | 问题及证据 | 根因 | 实际修复 / 验证 | 状态 |
| --- | --- | --- | --- | --- |
| SN-001 / P1 / HTTP | HTTP 200 HTML 被当作成功空对象；请求/解析可永久挂起。`reproduced-failures.log` | JSON 失败被吞；无覆盖响应体解析的 deadline | `src/api/http.js:7` 严格 JSON、保留错误类别、60s 默认超时和取消清理；ASR/语音评估显式延长原有超时。六项 reliability 回归包含挂起响应体、429、预取消 | Fixed |
| SN-002 / P2 / LLM | 已取消信号仍发起收费请求 | 仅注册后续 abort 监听，未检查已有取消 | `api/_llm.js:185` 请求前 throwIfAborted；超时区分 provider_timeout/504；测试断言预取消时不调用 fetch | Fixed |
| SN-003 / P1 / Camera | 模型加载成功但推理全部失败时仍显示分析就绪 | loaded 与 successful inference 混为一谈 | worker 分别报告检测器执行成功；部分失败显示 partial；连续三次全失败关闭 worker；等待有效样本 watchdog。真实模型/物理摄像头及故障测试见下表 | Fixed |
| SN-004 / P1 / Persistence | 本地 JSON 账号保存被标为云同步 | cloudSaved 同时表达“账号保存”和“Supabase 保存” | API 返回 storageMode；客户端分离 accountSaved/cloudSaved 与反馈标志；校验返回 attempt ID；浏览器移除测试缓存再从隔离服务恢复，显示 not cloud-synced | Fixed |
| SN-005 / P2 / Usage | Daily 对话在 speaking-feedback 入口被归为最终反馈成本 | 只按 URL 分组 | 保存 action，并按 conversation_stream/conversation 优先分类；单测验证。旧账本未回写，历史不明项仍不伪造归因 | Fixed（新记录） |
| SN-006 / P2 / Supabase | app/admin 原请求无统一超时且可能透出原始错误 | 重复直接 fetch，异常未规范化 | 复用10s securityRequest、错误脱敏、可选 prefer；保留 typed storageCode/resource 兼容。三个 mock 合同测试通过；真实 Supabase 另列阻塞项 | Fixed（传输实现） |
| SN-007 / P1 / Dependencies | 初始 production audit 13 项，5 high | 锁文件含受影响兼容版本 | 同 major 更新13个锁定解析；production 降至9项（1 high/8 moderate）。zod 3.25.76 high 建议修复为4.6.7，未擅自升级；未证明运行路径可利用 | Partial |
| SN-008 / P1 / Long Daily | 80条有效回答、77530字节反馈被413拒绝，`http-security-load.json.knownGap` | 游客45000字符/登录50000字符 guard 在模型上下文压缩前触发 | 保留复现。尚未实现保持 answerIndex/证据引用的长记录引用或压缩协议，不能只移除反滥用上限 | Partial |
| SN-009 / P3 / Fonts | 全产品截图等待 Google Fonts 超时，`full-product-font-timeout.log` | 外部字体依赖可阻塞截图字体就绪等待 | 最终测试用 Playwright 的 NO_FONTS_READY 开关验证页面与截图；产品字体策略未修改。截图可能用 fallback，不能宣称字体网络稳定 | Partial |
| SN-010 / P1 / VIP Usage | 用户没有自己的 provider token 明细；不能据此透明说明充值成本 | 既有用量报表仅限管理员 | 新 accountUsageReport 只读登录者账本，排除fixture、保留缺回执/未定价；AccountUsage 展示模型、输入/输出、缓存、估算与刷新；管理员加入按真实 token mix 的套餐成本投影 | Fixed（用量/估算） |
| SN-011 / P2 / VIP Renewal | 管理员再次授权可能覆盖剩余 VIP 天数；已是VIP不能申请续费 | 授权一律从今天算，申请入口隐藏 | 活跃会员续期延长现有截止日；VIP也可提交 renewal/extra-practice enquiry；重复pending不重复创建，无付款记账；单测覆盖权限/续期/申请幂等 | Fixed（审核申请） |
| SN-012 / P1 / Test Account | 需要可长期测试但不能变成线上万能账号 | 原计划只有有限 free/vip 配额 | server-only provisioning，新普通learner；仅本地存储、loopback、非生产时免练习及个人日配额；仍保留全站预算/分钟限流/会话超时；生产禁用和预算保护有单测 | Fixed（本机测试用途） |
| GATE-DB / P1 / Cloud | 未配置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY | 无可验证测试实例/凭据 | production-storage-gate.log 明确 missing_configuration；未迁移或写生产数据 | Blocked |
| GATE-SPEECH / P1 / Speech | 未完成人声识别与真实可听 TTS 闭环 | 本地ASR缺 model.bin；云评估/TTS凭据缺失；受控事件不足以证明真实服务 | 提供浏览器/fixture回归，不将其标为真实ASR或发音准确率 | Blocked |
| GATE-PAY / P1 / Recharge | 没有真实充值付款、钱包到账、退款与支付对账 | 未提供/接入商户与签名回调 | 保留 paymentsEnabled=false；申请显式 not-requested；没有造订单已支付、余额或售价 | Blocked |
| GATE-PROD / P1 / Deployment | 生产HTTPS、实例并发、持久化恢复没有验收 | 用户禁止自动部署；没有测试生产环境 | 只做本地 build、HTTP并发、静态配置检查 | Blocked |

## D. 测试结果与证据分级

| 测试 | 分类 | 实际结果 | 证据文件（本目录） |
| --- | --- | --- | --- |
| 原始测试基线 | 单元/Mock合同 | 180通过 | baseline-tests.log |
| 首轮修复回归 | 单元/Mock合同 | 191/191通过、无skip | regression-tests.log |
| VIP专项 | 单元/Mock合同 | 7/7通过：本地权限、预算、本人用量、新旧会员续期与投影 | vip-before.log、vip-unit.log |
| VIP后全量回归 | 单元/Mock合同 | 198/198通过，无失败/skip；5076.6ms为本次测试运行时间，不是应用性能指标 | vip-regression.log |
| lint | 静态 | 通过 | lint.log、vip-lint.log |
| typecheck | 静态 | 通过 | typecheck.log、vip-typecheck.log |
| production build | 静态/构建 | 本地构建通过，不等于部署门禁通过 | build.log、vip-build.log |
| IELTS/TOEFL全产品 | 真实浏览器 + Mock服务/合成音频 | 9场景通过，包括完整IELTS 12题、TOEFL已配置mock 11题、反馈/刷新/重试链接 | full-product/browser-results.json、full-product.log |
| VIP后全产品回归 | 真实浏览器 + Mock服务/合成音频 | 重启隔离fixture后9场景再次通过、零pageerror，包括VIP试用、审核、撤销 | vip-full-product/browser-results.json、vip-full-product.log |
| IELTS题库/计时/布局 | 真实浏览器 + 受控语音/模型 | 6场景通过，包括Part2 60s准备/120s响应、Part3整组、320/390px | ielts/browser-results.json、ielts.log |
| Daily连续语音状态 | Mock集成 + 真实WebAudio/Recorder | 10用户回合、11AI含开场；无重叠、录音非空、释放tracks | continuous-browser.json |
| Daily连续真实模型 | 真实API + 真实Chrome，合成文字输入 | 10连续轮 + 真实最终反馈 + 本地刷新恢复；零pageerror | real-browser.json、real-browser.log |
| 真实模型/合成摄像头 | 真实WASM/模型，非真人设备画面 | 12推理样本；空面部/身体检测未被当成失败 | vision-browser.json |
| 真实摄像头 | 真实设备 + 真实本地MediaPipe | 12样本面部/上身可观察、手部0；未保存原始视频 | physical-camera.json |
| 摄像头/权限/存储失败 | Mock故障 + 浏览器 + 隔离本地存储 | 4检查通过：拒权后文字可用、模型加载失败/释放、服务器恢复、无CSRF拒绝 | failure-browser.json |
| HTTP安全/本地并发 | Mock外部模型 + 真实本地HTTP | 401/403/400/404/413边界；12并发SSE完成；长反馈413单列产品缺口 | http-security-load.json |
| 真实Supabase | 真实服务门禁，未连通 | 缺配置，不能验收云保存/恢复/RLS | production-storage-gate.log |
| 新账号VIP与实际入账 | 真实Chrome + 本机账号 + 真实DeepSeek文字调用 | 登录、实际入账、learner拒绝管理操作、申请刷新、320/390/1280px通过；不含支付/声学/云存储验收 | vip-real-browser.json |
| 依赖/秘密扫描 | 静态 | production仍9项；配置secret精确扫描无命中 | dependency-audit-final-production.json、inventory.json |
| 生产部署验收 | 未执行 | 不通过/未验收，不自动部署 | 本报告 |

静态覆盖限制：现有 ESLint 主要检查 components/pages/Layout，jsconfig 排除 src/api、src/lib 等。没有测量整个仓库的代码覆盖率，不报虚构百分比。支付、Safari/Firefox/移动真机、断网长时间恢复、真人背景噪声与长时间内存增长均未完整验收。

初次真实浏览器运行因“Get AI feedback”与实际“Get feedback”选择器不符失败，后修正并重跑；初次故障测试也保留严格选择器错误。相关 `*-initial-selector*.json/log` 未删除。最终通过并不抹去初次失败。字体超时也保留。

VIP首次浏览器脚本因 Sign In/Sign in 大小写定位错误未能提交登录，未发起模型调用；修正表单提交定位后通过，保留 `vip-initial-selector-failure.json`。新账号的实际一笔调用回执为321输入、48输出、128缓存命中、193缓存未命中，TTFT896ms、总生成1343ms；会员页真实读取到账本对应369合计token，模型成本估算¥0.00038756–¥0.00077512。账本不是从旧审计样本填充的。人工查看 `vip-320.png`，确认用量、估算、无限测试限制与未接支付说明可见。

### 真实指标，严格限定范围

最终10次对话回执：prompt 6059、completion 459、cached input 3968、uncached input 2091。模型回执为 `deepseek-flash`，最终反馈模型 `deepseek-v4-pro`。TTFT 603–1136ms、中位831ms；完整生成847–1701ms、中位1197.5ms。这些只覆盖最终10次对话，不含反馈、前次运行、重试、全部账号或供应商账单。

真实摄像头12样本跨7.749s，推理累计2035.6ms、单样本最大675.9ms，包含预热；这不是稳定摄像头FPS或动作准确率基准。合成摄像头12样本跨7.247s，累计1844.7ms、最大988.1ms。12个本地fixture并发请求总墙钟389ms，全部完成；不能据此推算DeepSeek/Supabase/生产吞吐。

人工查看 `real-daily-desktop.png` 与 `real-review-320.png`：保留单导航、浅色、场景与滚动对话、可读反馈，没有这两个截图可见的重叠。自动布局覆盖不替代所有页面的视觉验收。

## E. VIP、充值与测试账号交付

### 已实现的充值基础，而非伪支付

1. 用户在 Membership 看到自己的实际 provider token、缓存拆分、模型成本区间、回执覆盖率和遗漏信息；不能通过 body.userId 读取别人。
2. 管理员既有月度/分钟成本计算器保留，新增“Token-based recharge cost baseline”，以真实模型/缓存/输入输出比例投影，不把一个 token 定成所有模型的统一成本。
3. 用量不足、未知模型、缺回执或截断扫描时不自动产出可信售价。正式售价还需运营成本、语音、税费、支付费率、利润假设和足够样本。
4. VIP开通/续期/额外练习申请写入原会员账本；pending幂等，管理员审核可见类型；申请不扣钱、不增加付费余额、不伪造支付成功。续期保留已有天数。
5. 已是VIP也能申请；测试账号会明确显示“Unlimited local testing”。普通free/vip计划额度没有改成全员无限。

官方模型单价于2026-11-12重新核对，仍按峰谷区间估算：[DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。前述最终10轮回执的模型成本估算为 **¥0.00400636–¥0.00801272**，不含最终反馈、TTS或其他费用。相同输入输出/缓存/模型比例下，100万合计token的模型成本投影约¥0.614661–¥1.229322；这只是很小的文字对话样本，**不是VIP零售价、已付款金额或真人口语每分钟成本**。计算证据：`vip-real-cost-baseline.json`。没有把这组历史审计用量注入新账号账本。

### 本地无限测试账号

- 登录入口：`http://localhost:5173/auth?returnTo=%2Fmembership`。
- 邮箱：`speaknow-test@local.example`；角色：learner，不是管理员。
- 随机密码及完整信息：项目 `data/testing-account.local:1`，权限0600，忽略于版本控制；报告不复制密码。没有更改既有用户密码。
- 有效截止：2099-01-01；“无限”指本机免练习/月配额及个人每日调用/token配额，不承诺无限供应商预算、无安全限流或单会话永久运行。
- 只有 server-only 脚本可签发该标志；须本地JSON存储、loopback请求、非production/非Vercel/非Lambda。保留全站请求/token预算、分钟限流、CSRF、会话超时与私有题库边界。
- 实际测试仍可能消耗配置的 DeepSeek API 额度；不是免费无限上游服务。需要撤销时可由有权限的管理员撤销VIP，或由本机所有者在受控脚本中撤销该账号 entitlement。
- `scripts/create-local-test-account.mjs:1` 遇已存在账号会退出，不覆盖密码或数据。不要把本机 data 或密码文件发布到静态网站。

## F. 改动文件

下表列出代码/测试改动；证据与本报告另在当前docs目录。完整清单以 `inventory.json.changedFiles` 为准。

| 路径 | 修改目的 / 关联问题 |
| --- | --- |
| `src/api/http.js:7` | 严格解析、超时、取消；SN-001 |
| `src/lib/dailyTranscription.js:1` | 保留ASR较长超时；SN-001 |
| `src/components/SpeechAudioFeedback.jsx:1` | 语音评估超时与账号/云反馈状态；SN-001/004 |
| `api/_llm.js:185` | 预取消、可识别超时；SN-002 |
| `src/lib/expressionVision.worker.js:1` | 每检测器推理成功标志；SN-003 |
| `src/lib/expressionVisionSession.js:2` | first-sample、partial、失败阈值与释放；SN-003 |
| `src/components/presentation/CameraPreview.jsx:1` | 部分可用/不可用状态；SN-003 |
| `public/expression-worker.js:1` | 重建实际部署worker；SN-003 |
| `api/_appStore.js:1` | storageMode、有界Supabase、兼容；SN-004/006 |
| `api/_adminStore.js:1` | 复用有界脱敏传输；SN-006 |
| `api/_securityStore.js:1` | prefer与结构化脱敏错误；SN-006 |
| `api/speaking-practice.js:1` | 返回真实存储模式；SN-004 |
| `src/lib/learningStore.js:65` | 账号/云保存分离、返回ID校验；SN-004 |
| `src/pages/LearningReview.jsx:1` | 保存文案及状态；SN-004 |
| `src/components/DailyFeedbackPage.jsx:1` | 反馈保存归属；SN-004 |
| `api/_membership.js:1` | logical action用量归因、本地测试配额；SN-005/012 |
| `api/_usageReport.js:1` | 对话模块与本人真实用量；SN-005/010 |
| `api/membership.js:1` | 本人usage action；SN-010 |
| `api/_plans.js:1` | 本机测试权限边界；SN-012 |
| `api/_apiGuard.js:1` | 本机测试免个人日配额，保留全站预算；SN-012 |
| `api/_membershipActions.js:1` | 申请类型、非支付标记、续期保留余天；SN-011 |
| `src/pages/Membership.jsx:1` | 真实用量、无限测试说明、续期/充值申请；SN-010/011/012 |
| `src/components/AccountUsage.jsx:1` | 新增本人回执与估算展示；SN-010 |
| `src/components/AdminUsage.jsx:1` | 真实token比例的成本投影；SN-010 |
| `src/components/AdminMembership.jsx:1` | 审核请求类型/支付状态与续期含义；SN-011 |
| `shared/usagePricing.js:1` | 价格核对日期、受覆盖率约束的成本投影；SN-010 |
| `scripts/create-local-test-account.mjs:1` | 安全随机密码、本机learner与审计记录；SN-012 |
| `package-lock.json:1` | 13项兼容版本解析更新；SN-007 |
| `scripts/industrial-audit-inventory.mjs:1` | 文件/API/env/版本/secret扫描证据 |
| `tests/learning/industrial-reliability.test.mjs:1` | HTTP、取消、视觉失败复现/回归 |
| `tests/learning/industrial-cloud-store.test.mjs:1` | Supabase传输mock合同 |
| `tests/learning/industrial-storage.test.mjs:1` | 服务器本地与云语义合同 |
| `tests/learning/usage-costs.test.mjs:1` | 对话/反馈用量归因 |
| `tests/learning/browser.mjs:1` | 本地保存文案断言更新；本脚本未单独重跑 |
| `tests/learning/review-browser.mjs:1` | 同上 |
| `tests/learning/core-flow-browser.mjs:1` | 同上 |
| `tests/learning/daily-vision-browser.mjs:1` | 可配置输出目录、保留既有证据 |
| `tests/learning/full-product-browser.mjs:1` | IELTS/TOEFL完整mock训练回归 |
| `tests/learning/industrial-failure-browser.mjs:1` | 摄像头失败、隔离保存恢复、CSRF |
| `tests/learning/industrial-http.mjs:1` | 安全边界、fixture并发、长反馈复现 |
| `tests/learning/industrial-real-browser.mjs:1` | 十轮真实DeepSeek与真实反馈 |
| `tests/learning/vip-usage.test.mjs:1` | 本人账本、测试权限、预算、续期与成本投影 |
| `tests/learning/vip-real-browser.mjs:1` | 新账号真实登录/调用/用量/申请/布局 |

## G. 剩余工作与发布门禁

1. **P1 长会话反馈**：在保存/反馈接口设计带版本的attempt引用，或按现有证据索引做有界压缩；需覆盖80+回答、失败重试、视觉引用和重复反馈计费。现在不能声称无长度限制的完整会话闭环。
2. **P1 云存储**：通过受控环境提供 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY，验证实际RLS/归属、保存→刷新→读取、故障恢复、并发CAS；不要在聊天中粘贴密钥。
3. **P1 真人语音**：本地缺 `.local-asr/model/model.bin`；AZURE_SPEECH_KEY、AZURE_SPEECH_REGION、ELEVENLABS_API_KEY、ELEVENLABS_VOICE_ID 未配置。浏览器自带语音仍可作为替代，但需真实设备/网络下识别、打断、恢复、可听播放测试。
4. **P1 充值上线**：需确认零售套餐与成本假设、商户渠道、签名回调、幂等订单、金额/币种校验、退款和对账后，才能开启真实付款。管理员审核开通不是收款证明。不得因UI能申请就声称充值闭环已上线。
5. **P1 依赖风险**：处理剩余zod high（GHSA-mrhx-c7xc-m3w5）及8 moderate；先验证实际可达性/兼容性，再决定大版本升级。另全依赖audit还包含1 low。
6. **P2 性能/生命周期**：需真实服务但受预算控制的多账号测试、长时间camera/3D内存采样、断网/后台页/重连恢复；当前12请求本地fixture只能证明小范围竞争下没有失败。
7. **P2 设备与反馈**：手部轨迹/姿态动作需可控真人标注；物理摄像头摘要→最终真实模型反馈仍需独立端到端验收；不能称可靠情绪/信心检测。
8. **P3 工具覆盖/字体/旧路由**：扩展静态检查范围需逐步推进；字体失败恢复和历史路由回归尚不完整。没有在本轮为追求“全部绿”关闭应用验证规则。

结论：当前可用于**明确边界的本地/受控测试**，不授予“有限beta已就绪”或“生产就绪”评级。构建成功、Mock通过、真实文字模型成功、摄像头推理成功，分别只是各自链路的证据，不能互相代替。
