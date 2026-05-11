# SpeakNow Technical Report
# SpeakNow 技术报告（中英双语版）

Module: ENT208TC Session 4 Group 25  
Project: SpeakNow  
Academic Year: 2025-2026

Team Members / 团队成员  
- Yujie Yang — 2363253
- Zihan Jiang — 2362327
- Yile Zhang — 2363305
- Xinyu Shen — 2363210
- Zhuoru Zhang — 2363097
- Zimu Zhang — 2364249
- Ye Li — 2362556

## 1. System Architecture / 系统架构

### 1.1 Architecture Overview / 架构概述

English:  
SpeakNow is a web-based speaking practice platform built as a single-page React application with serverless-style API routes. The system supports two main learning workflows: scenario-based voice conversation and slide-based presentation rehearsal. Around these core functions, the project also includes authentication, user history, profile tracking, and an admin dashboard.

The architecture is intentionally hybrid. On the client side, React handles rendering, navigation, microphone interaction, PDF upload, and browser text-to-speech. On the server side, API routes handle authentication, persistence, LLM orchestration, and admin analytics. For storage, the system supports both Supabase-backed hosted persistence and local JSON fallback, allowing the project to remain usable in both production and coursework demo environments.

中文：  
SpeakNow 是一个基于 Web 的口语训练平台，采用 React 单页应用加类 serverless API 路由的方式构建。系统主要支持两条核心学习流程：情景口语对话训练和基于幻灯片的演讲训练。在这两个核心功能之外，项目还包含登录认证、历史记录、个人进度追踪以及管理员后台。

整体架构是有意设计成混合式的。前端 React 负责界面渲染、页面跳转、麦克风交互、PDF 上传和浏览器语音播报；后端 API 路由负责认证、数据持久化、大模型调度以及后台事件分析。数据存储同时支持 Supabase 线上持久化和本地 JSON 回退，因此既能部署上线，也能在课程展示环境中稳定运行。

### 1.2 Components / 组件说明

#### Frontend Application / 前端应用
English:  
The frontend is built with React 18 and bundled with Vite. It includes route-level pages such as login, home, scenario setup, live voice chat, presentation practice, final reports, profile, history pages, and the admin dashboard.

The frontend is necessary because the product is interaction-heavy and must react quickly to speech, document upload, and live feedback rendering. Vite was used to keep development iteration fast, especially during repeated UI and prompt tuning.

中文：  
前端基于 React 18 构建，并通过 Vite 打包。页面层包括登录页、首页、情景设置页、实时口语对话页、演讲练习页、结果报告页、个人主页、历史记录页以及管理员后台。

前端之所以重要，是因为这个产品交互密集，需要快速响应语音输入、文档上传和实时反馈展示。Vite 的选择主要是为了提升开发阶段的构建速度和热更新效率，方便反复调整 UI 和提示词。

#### Authentication Layer / 认证层
English:  
Authentication is handled through `AuthContext`, `ProtectedRoute`, and `AdminRoute`. Every user must log in before entering the app, and only users whose email resolves to the admin list can access the admin dashboard.

This layer is necessary because the system distinguishes between ordinary learners and administrators. It also prevents unauthorized access to user records, admin summaries, and role management features.

中文：  
认证层由 `AuthContext`、`ProtectedRoute` 和 `AdminRoute` 组成。所有用户进入系统前都必须先登录，只有邮箱在管理员名单中的用户才可以访问后台管理页面。

这一层是必要的，因为系统需要区分普通学习者与管理员，同时防止未授权用户访问用户记录、后台统计和管理员权限管理功能。

#### Voice Practice Module / 情景口语模块
English:  
The voice practice module covers scenario selection, role setup, live dialogue, structured AI feedback, and a final session report. It relies on speech recognition in the browser, compressed dialogue history, and a task-specific LLM endpoint.

This module exists because speaking practice is one of the core product goals. It simulates realistic conversational situations and provides immediate coaching on task completion, vocabulary, grammar, and pronunciation-related performance.

中文：  
情景口语模块覆盖场景选择、角色设定、实时对话、结构化 AI 反馈和最终练习报告。它依赖浏览器语音识别、压缩后的对话历史，以及专门为该任务设计的大模型接口。

这个模块存在的原因是，情景化口语训练本身就是产品的核心目标之一。它通过模拟真实对话场景，为用户提供任务完成度、词汇、语法和发音相关的即时反馈。

#### Presentation Practice Module / 演讲练习模块
English:  
The presentation module supports PDF upload, page text extraction, rehearsal mode, pause feedback, analysis, and a final report. It is designed differently from the voice chat module because presentation speaking is longer, slide-driven, and structurally different from short conversational replies.

This module is necessary because presentation practice requires page-aware prompts and a more structured evaluation pipeline. Restricting uploads to PDF reduces document parsing instability and keeps the workflow predictable.

中文：  
演讲练习模块支持 PDF 上传、页面文本提取、演讲排练、停顿反馈、分析以及最终报告。它和情景口语模块的设计不同，因为演讲任务时长更长、强依赖幻灯片内容，结构上也不同于简短对话。

这个模块之所以必要，是因为演讲练习需要和页面内容绑定的提示与更结构化的评估流程。当前只允许上传 PDF，是为了降低文档解析不稳定带来的错误。

#### API Layer / API 层
English:  
The backend API surface consists of `/api/local-data`, `/api/voice-chat`, `/api/presentation-analysis`, `/api/presentation-pause-feedback`, `/api/presentation-report`, and `/api/admin-track`. Each endpoint is responsible for a distinct product function rather than using one oversized generic endpoint.

This separation improves maintainability, timeout tuning, and output reliability. For example, pause feedback needs very fast responses, while full presentation reports can tolerate slightly longer LLM latency.

中文：  
后端 API 主要包括 `/api/local-data`、`/api/voice-chat`、`/api/presentation-analysis`、`/api/presentation-pause-feedback`、`/api/presentation-report` 和 `/api/admin-track`。每个接口都对应一个清晰的产品能力，而不是把所有逻辑都塞进一个通用接口。

这种拆分有利于维护、超时参数调优以及输出稳定性。例如停顿反馈必须非常快，而完整演讲报告可以接受稍长一点的大模型处理时间。

#### LLM Routing Layer / 大模型路由层
English:  
The LLM router is implemented in `api/_llm.js` and currently uses a provider chain of Zhipu first and LongCat second. It supports structured JSON output, feature-specific timeout settings, one light retry for retryable failures, and provider fallback when the first call fails.

This layer is necessary because single-provider dependency proved too fragile during development. The fallback design improves service continuity when one provider is slow, rate-limited, or temporarily unavailable.

中文：  
大模型路由层实现于 `api/_llm.js`，当前采用“智谱优先，美团 LongCat 兜底”的链式调用方式。它支持结构化 JSON 输出、按模块单独设置超时、对可重试错误进行一次轻重试，以及主提供方失败后自动切换。

这一层是必要的，因为开发过程中已经证明，依赖单一模型提供方非常脆弱。回退策略能在某个服务商变慢、限流或短暂不可用时，保证系统仍然可用。

#### Storage Layer / 存储层
English:  
The app uses two logical storage domains: application data and admin analytics data. In production, both can be backed by Supabase through REST calls using a server-side service-role key. When hosted storage is unavailable, the system can fall back to local JSON files.

This design supports both practical deployment and coursework demonstration. It also separates learner-facing session data from admin event monitoring, which keeps the data model cleaner.

中文：  
系统使用两类逻辑存储：应用业务数据和管理员分析数据。在线上环境中，这两部分都可以通过服务端 `service_role` key 访问 Supabase REST 接口；当托管存储不可用时，系统还可以退回到本地 JSON 文件。

这种设计既支持真实部署，也支持课程演示。同时它把用户业务数据和管理员事件分析分开，避免数据模型混杂。

### 1.3 Data Flow / 数据流

English:  
A typical voice practice flow starts when the user logs in and opens a scenario. The browser captures the user’s voice through speech recognition and converts it to text. The frontend sends the scenario metadata, recent history, and current utterance to `/api/voice-chat`. That endpoint builds a task-specific prompt and forwards a structured request through the LLM router. The LLM returns a JSON object containing an AI reply and structured feedback fields. The frontend renders the conversation, optionally plays TTS, and finally stores the session through `/api/local-data`. At the same time, the app mirrors session-related events into the admin tracking store through `/api/admin-track`.

The presentation flow is similar but uses uploaded PDF text and page-based context instead of short turn-based dialogue. During practice, the frontend calls `/api/presentation-pause-feedback` for fast feedback and later `/api/presentation-report` for a fuller evaluation. Session records are stored in the app data store and summarized again for admin visibility.

中文：  
典型的情景口语流程从用户登录并进入某个场景开始。浏览器通过语音识别捕捉用户发言并转换成文本，前端再把场景信息、最近对话历史和当前发言一起发送到 `/api/voice-chat`。该接口会组装针对该任务的提示词，并通过大模型路由层发起结构化请求。模型返回一个 JSON，其中同时包含 AI 回复和结构化反馈字段。前端再把消息渲染出来，必要时进行 TTS 播放，并最终通过 `/api/local-data` 保存这次练习记录。同时，系统还会通过 `/api/admin-track` 把相关事件同步到后台分析存储中。

演讲流程与此类似，但它依赖上传的 PDF 文本和逐页上下文，而不是短轮次对话。练习过程中前端会调用 `/api/presentation-pause-feedback` 获取快速反馈，结束后再调用 `/api/presentation-report` 生成完整报告。所有会话记录既会保存到业务存储，也会同步摘要到管理员视图。

## 2. Technology Justification / 技术选型论证

| Technology / Tool | What we chose | Alternatives considered | Why we chose this | 中文说明 |
| --- | --- | --- | --- | --- |
| Frontend framework | React 18 | Vue 3, Next.js, plain SPA | React offered the best ecosystem fit for routing, components, charts, and rapid UI iteration. | 选择 React 是因为生态成熟、组件复用方便，并且和当前项目的交互复杂度最匹配。 |
| Build tool | Vite | CRA, Webpack custom config | Vite is much faster in local iteration and reduced development friction. | 选择 Vite 主要是因为启动和热更新速度快，适合频繁调整 UI 与提示词。 |
| Styling | Tailwind CSS + Radix/shadcn | Material UI, Chakra UI, pure CSS | Tailwind gave precise control without heavy design lock-in. | Tailwind 兼顾开发效率和可控性，不会像重型组件库那样把视觉样式锁死。 |
| Routing | React Router | Next router, Wouter | Strong SPA support and clear protected-route patterns. | React Router 很适合单页应用，也方便做登录保护和后台权限控制。 |
| Async state | TanStack Query | Redux, Zustand, manual fetch | Good fit for server-state style data and loading/error handling. | 对接口数据的缓存、加载和错误处理更规范，减少重复代码。 |
| Backend style | Vercel API routes + local Node backend | Express server, Firebase Functions | Lightweight deployment with minimal ops overhead. | 既方便上线，又保留了本地开发调试后端接口的能力。 |
| App storage | Supabase REST + local JSON fallback | localStorage, Firestore, self-hosted DB | Hosted persistence plus safe fallback for demos and unstable environments. | Supabase 适合线上持久化，而本地 JSON 让演示和开发环境不会因为云端问题完全失效。 |
| Admin storage | Separate admin tables/store | Shared tables only, spreadsheets | Clearer separation of learner data and admin telemetry. | 用户业务数据和后台分析数据分离后更容易维护和管理。 |
| LLM strategy | Zhipu primary + LongCat fallback | OpenAI only, OpenRouter only, one free model | Improves resilience under timeout, 429, or provider errors. | 多提供方链路比单一模型更稳，尤其适合免费额度或易波动的服务。 |
| Speech layer | Browser Web Speech APIs | Cloud speech services | Lower cost and simpler integration for a student product. | 浏览器原生语音能力成本低、接入轻，但缺点是跨浏览器稳定性一般。 |
| Presentation input | PDF-only | PPTX, DOCX, images | Reduced parsing complexity and improved stability. | 限制 PDF 上传是为了减少解析错误，提高演讲模块稳定性。 |
| Deployment | Vercel | Netlify, Railway, Render | Strong fit for SPA + serverless route deployment. | Vercel 非常适合这个“前端 + 轻后端接口”的项目结构。 |

### Technical Risks and Mitigation / 技术风险与缓解

English:  
The first risk was AI reliability. Different providers returned different response times and failure modes, which sometimes produced fallback replies or broken UX. We mitigated this through provider fallback, per-module timeout tuning, shorter prompts, and one light retry for timeout and 429-class errors.

The second risk was data persistence mismatch between local and production environments. We mitigated this by separating hosted Supabase storage from local JSON fallback and by moving serverless temporary file writes away from invalid production paths.

The third risk was browser voice instability. We mitigated this by shortening silence thresholds, reducing auto-play in the most latency-sensitive module, and improving text-first fallback behavior when speech playback is not ideal.

中文：  
第一个风险是 AI 稳定性。不同模型服务商的响应时延和失败模式差别很大，这会导致回退回复或者交互体验断裂。我们通过多提供方回退、按模块设置不同超时、缩短提示词以及对超时和 429 做一次轻重试来缓解。

第二个风险是本地环境和线上环境的数据持久化不一致。我们通过区分 Supabase 托管存储与本地 JSON 回退，并修正 serverless 环境下不可写路径的问题来缓解。

第三个风险是浏览器语音能力不稳定。为此我们缩短了静音自动发送阈值、减少高时延模块里的自动播音，并确保即使语音能力不理想，文本反馈链路也仍然可用。

## 3. Deployment Guide / 部署指南

### Environment Requirements / 环境要求

| Requirement | Version / Notes | 中文说明 |
| --- | --- | --- |
| Node.js | 18+ recommended | 推荐使用 18 及以上版本 |
| npm | 9+ | 建议使用较新版本 |
| Browser | Recent Chrome preferred | 语音功能建议在新版 Chrome 测试 |
| Supabase | Required for durable production storage | 若要线上稳定存储，需要 Supabase |
| Vercel CLI | Optional but useful | 线上部署建议安装 |

### Setup Steps / 部署步骤

1. Clone the repository / 克隆仓库

```bash
git clone https://github.com/xuenioahh/SpeakNow.git
cd SpeakNow
```

2. Install dependencies / 安装依赖

```bash
npm install
```

3. Create local env file / 创建本地环境变量文件

```bash
cp .env.example .env.local
```

4. Fill in the required environment variables / 填写环境变量

```env
ZHIPU_API_KEY=your_zhipu_key
ZHIPU_MODEL=glm-4.7-flash
LONGCAT_API_KEY=your_longcat_key
LONGCAT_MODEL=LongCat-Flash-Lite
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VITE_ADMIN_EMAILS=zhangyz1003@foxmail.com
```

5. Run Supabase SQL if using hosted persistence / 若使用 Supabase，执行 SQL 建表

- `supabase/app_schema.sql`
- `supabase/admin_schema.sql`

6. Start local development / 启动本地开发

```bash
npm run dev
```

7. Build before deploy / 部署前构建

```bash
npm run build
```

8. Deploy to production / 部署到线上

```bash
npx vercel --prod
```

### Common Issues / 常见问题

| Problem | Likely cause | Solution | 中文说明 |
| --- | --- | --- | --- |
| `Incorrect email or password` | Account not registered in current storage | Register again in the active environment | 当前环境的数据源里没有这个账号，需要重新注册 |
| `Admin Access Required` | `VITE_ADMIN_EMAILS` missing or stale session | Check env var, redeploy, sign out and sign in again | 检查后台邮箱环境变量，重新部署，再重新登录 |
| `ENOENT mkdir '/var/task/data'` | Invalid serverless write path | Use Supabase or `/tmp` strategy | Vercel 线上不能直接写该目录，需要改为 Supabase 或临时目录 |
| No speech playback | Browser speech support or permission issue | Test in Chrome and allow mic/audio features | 通常是浏览器兼容性或权限问题，优先用 Chrome 测试 |

## 4. IP Strategy / 知识产权战略

### Novelty / 创新点

English:  
The novelty of SpeakNow lies in integrating two distinct speaking-learning workflows inside one coherent product architecture: short-turn scenario dialogue and slide-aware presentation rehearsal. The system also combines these user-facing flows with persistent records, admin visibility, and resilient multi-provider LLM orchestration.

中文：  
SpeakNow 的创新点不在于单独用了某个模型或某种上传方式，而在于把两种性质不同的口语训练流程整合进同一个统一产品架构中：一类是短轮次情景对话，另一类是与幻灯片绑定的演讲排练。同时，系统还把这些前台学习流程和持久化记录、后台可视化管理、多模型回退能力整合在了一起。

### Prior Art / 现有产品与先例

| Existing product / patent | What it does | How SpeakNow differs | 中文差异说明 |
| --- | --- | --- | --- |
| JoeSpeaking / IELTS Speaking Simulator | LLM-driven speaking simulator | Focuses mainly on oral dialogue | 我们不仅有口语对话，还有演讲排练、后台和历史记录体系 |
| US Patent App. 20240330380 | AI speaking suggestions during video capture | More one-way and recording-oriented | 我们更强调双向交互式练习与 slide-aware 反馈 |
| MDPI 2025 speaking system | Generative AI speaking training | More general training pipeline | 我们的实现更偏向完整可部署产品，而非论文原型流程 |

### Patent Decision / 专利决策

English:  
Patent decision: No. The project’s defensible value comes more from product integration, prompt engineering, workflow design, and operational tuning than from a narrowly patentable technical invention. Filing and enforcing a patent would also be unrealistic for a student team.

中文：  
专利决策：不申请。这个项目真正有价值的部分更偏向产品整合、提示词工程、流程设计和工程调优，而不是一个容易被单独抽象并强力保护的专利点。同时，对学生团队而言，专利申请和后续维权的成本也不现实。

### Alternative Protection / 替代保护方式

English:  
We would rely on trade secrets, private prompt templates, internal scoring logic, operational know-how, and first-mover advantage in the target user segment.

中文：  
替代保护方式主要包括：商业秘密、私有提示词模板、内部评分逻辑、工程调优经验，以及在目标用户群中的先发优势。

## 5. Limitations and Future Work / 局限性与未来工作

### Limitations / 局限性

| Limitation | Why it exists | User impact | 中文说明 |
| --- | --- | --- | --- |
| Browser speech instability | Native speech APIs are inconsistent | Lag or playback stutter may appear | 浏览器原生语音能力不稳定，可能导致卡顿或播报异常 |
| Provider-dependent AI latency | Free or low-cost providers vary in speed | Some replies may fall back or feel slow | 免费或低成本模型速度波动大，可能触发回退或延迟 |
| Lightweight custom auth | Security stack is intentionally simple | Weaker than production-grade auth | 当前认证机制够用，但安全性和账号管理不如成熟身份系统 |
| PDF-only presentation input | Scope was narrowed for stability | Users must convert PPTX/DOCX first | 用户需要先把其他文档转成 PDF |
| Admin dashboard is still operational | Analytics depth is limited | Good for inspection, weaker for research-level analysis | 后台目前适合查看和管理，不够适合做深度研究分析 |

### Future Work / 未来工作

English:  
Future work includes stronger managed authentication, more reliable cloud speech infrastructure, richer analytics in the admin dashboard, better personalization in profile insights, and broader document support such as PPTX ingestion.

中文：  
未来工作包括：接入更成熟的认证体系、使用更稳定的云端语音能力、增强后台分析能力、提升 Profile 个性化能力，以及支持 PPTX 等更丰富的演讲材料格式。

## References / 参考文献

Chen, Y.-Y., Hsiao, T.-H., & colleagues. (2025). *An intelligent English-speaking training system using generative AI and speech recognition*. Applied Sciences, 16(1), 189. https://www.mdpi.com/2076-3417/16/1/189

JoeSpeaking / IELTS Speaking Simulator. (n.d.). *GitHub repository*. https://github.com/hubeiqiao/IELTS-Speaking-Simulator

Real-time AI-driven speaking suggestions during asynchronous video capture. (2024). *U.S. Patent Application No. 20240330380*. https://patents.justia.com/patent/20240330380
