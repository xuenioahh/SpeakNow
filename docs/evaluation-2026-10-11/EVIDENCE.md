# SpeakNow 三方评审：证据与评分口径

后续工程状态见 [2026-10-13 核对与修复报告](../repair-progress-2026-10-13/REPORT.md)。本页保留当时入口失败的证据，不代表该问题仍存在。

评审日期：2026-10-11 至 2026-10-12（上海时间，跨日执行）。范围：本机 Omniverse 当前工作区，非线上部署认证。人物评分为模拟评审，不是真实访谈或购买实验。没有收到用户、收入、留存、CAC 或团队经历数据；未知不视为零。

## 本轮实际执行

- `node --test tests/impact/impact.test.js tests/consolidation/security.test.js`：26 项通过，0 失败。
- `node scripts/inspect-expression-api.mjs`：本地配置 `available: false`，无配置的候选模型提供方。不代表生产环境没有配置。
- 在隔离目录 `/private/tmp/speaknow-evaluation-runtime` 启动后端，进行真实 HTTP 认证的 Chrome 检查；不写真实用户库，不调用付费模型。
- 首次注册显示 `Origin rejected`；为本轮后端设置 `SPEAKNOW_ORIGIN=http://127.0.0.1:5190` 后注册通过。Vite 开发代理改写 Host，缺少 Origin 配置会阻断本地注册。
- 随后填写 Presentation Topic / Core Message / Desired Outcome，不上传 PDF，点击 Start Practice：无法进入 SpeakNow Communication Coach，返回清空后的准备页。重复执行得到相同结果。
- 源码证据：`Presentation.jsx` 允许无文件练习并删除 presentationFileUrl；`PresentationPractice.jsx:80` 的 effect 和 `:357` 的 render guard 仍要求 fileName 与 fileUrl，早于 Impact 分支。
- 完整端到端测试没有通过；本轮未声称录音保存、Impact 报告与重练全链路通过。
- 截图：[注册 Origin 拒绝](artifacts/registration-failure.png)、[无附件演讲入口失败后的页面](artifacts/practice-entry-failure.png)。
- 前两轮已执行的 3D/咖啡馆浏览器测试证明局部场景交互、草稿交接、移动端和降级可用；不能替代本轮演讲主路径验收。

## 当前源码事实

| 能力 | 依据 | 边界 |
| --- | --- | --- |
| 主平台整合 | App 路由、Presentation 中 ImpactSetup、Practice 中 PresentationCapture、Report 中 ImpactReport | 已接线不代表入口与重练路径全部可达 |
| 听众适配 | Technical / Business / General；允许具体 audienceDescription | 同一文本的模型视角，不是真实听众反应 |
| Moment Surgeon | 引文、优先理由、30–60 秒目标、linked attempts、实际 before/after 文本 | 无可靠句级时间戳；模型判断没有教练校准 |
| 证据校验 | contracts.js 检查引文、枚举、新数字、改进状态 | 引文存在不证明诊断或比较语义正确 |
| Voice Orb | Three.js、真实 listening RMS、真实播放状态、离屏暂停与销毁 | speaking 不使用真实输出音频 RMS；无品牌或情绪效果实验 |
| 口语报告 | localReports.js 标注 heuristic / text-rules-not-acoustic-measurement | Pronunciation 仍由字数和问句数推算，不能证明发音 |
| 旧演讲指标 | LiveScorePanel 标注 Demo indicators | 随机模拟组件保留在旧分支，不应算入新 Impact 测量 |
| 安全基础 | scrypt、HttpOnly、CSRF、所有权、AI 预算；六项安全测试通过 | 无线上渗透测试、容量、生产迁移或企业合规认证 |
| 成本与业务 | API token/request 记录、保守预算 | 未提供真实单位成本、留存、付费或 CAC 数据；依赖列表不证明订阅系统存在 |

## 评分

每项 1–10，高分代表较好；风险项也是越高风险越低。各维度等权。Persona A/B/C/D 分别为大学生、国际学生、职场新人、英语母语职场人士。

| Persona | First | Value | Learning | Feedback | Motivation | Emotion | Ease | Payment | /100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 6 | 5 | 5 | 5 | 4 | 7 | 4 | 3 | 48.75 |
| B | 5 | 5 | 4 | 5 | 4 | 6 | 4 | 3 | 45.00 |
| C | 6 | 6 | 5 | 6 | 4 | 6 | 4 | 4 | 51.25 |
| D | 4 | 5 | 4 | 5 | 3 | 5 | 4 | 3 | 41.25 |

用户均值 46.5625 → 47/100。

同行 Product Innovation / AI / Engineering / UX / Competitive：6 / 5 / 5 / 6 / 4，总评 52/100；创新 60/100；Technical Excellence 取 AI、Engineering、UX 的均值为 53.3333 → 53/100。

投资 Market / Problem / Differentiation / Defensibility / Business / Growth / Founder Evidence / Risk：7 / 6 / 4 / 3 / 4 / 5 / 5 / 2，总评 45/100。Founder 的 5 是信息不足的中性占位，不是能力结论。

Market Potential 取 Market、Problem、Growth 均值为 60/100。Final = User×30% + Technical×30% + Market×20% + Investment×20%，使用未取整分数得到 50.96875 → 51/100。该数为主观比较工具，不是增长概率或学习效能测量。

Funding Decision：Pass（当前融资决策）；建议先完成真实交付与付费试点。此结论不是“用户数为零”或“团队无能力”的判断。

## 竞争核查：官方资料

- [Yoodli](https://yoodli.ai/pricing)：个人角色扮演与反馈、组织自定义场景/评估标准/管理与集成；FAQ 载明 Pro $8/月、Advanced $20/月均为年付口径。不能和按月支付混为一谈。
- [VirtualSpeech](https://virtualspeech.com/pricing)：演讲、角色扮演、AI 反馈，浏览器及可选 VR；教育/企业自定义场景和集成。个人 $45/月或 $399/年，为查询当天列示价格。
- [Duolingo Max](https://blog.duolingo.com/duolingo-max/)：Video Call、Roleplay、情境对话后反馈与课程关联。
- [ChatGPT Voice](https://help.openai.com/en/articles/20001274-chatgpt-voice)：语音对话、文字伴随和上下文；具体功能受账号等条件限制。
- [Microsoft Speaker Coach](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach)：排练、节奏/语调/填充词等反馈和报告。

这些是厂商自述的功能/价格，不是本轮竞品实际效果横评；不引用厂商宣传数字证明学习效果。

## 优先建议

1. 修复无附件练习及定向重练入口，完成真实设备/模型/保存/重试的一条端到端验收。
2. 移除或明确隔离没有声学证据的发音和流利度判断；用教练盲评校准“最重要问题”和“Improved”，验证新任务迁移。
3. 聚焦一个近期任务人群，验证重练完成率、四周留存、真实支付和完整单位成本。

任何未来用户量、留存率、付费率、毛利目标均应作为提出的试点门槛，不得改写成已达结果或普遍行业标准。
