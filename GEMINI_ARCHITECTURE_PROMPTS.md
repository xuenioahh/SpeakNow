# Gemini Prompts For Architecture Diagram
# 给 Gemini 画系统架构图的 Prompt

## Prompt 1: Clean Academic Architecture Diagram

Create a clean, professional system architecture diagram for a university technical report.  
The product name is **SpeakNow**, a web-based speaking practice platform.

Style requirements:
- white background
- academic / professional look
- clean boxes with light blue, teal, and violet accents
- readable labels
- arrows showing data flow direction
- export-ready for Word report
- landscape layout
- minimal decoration, no cartoon style

The diagram must include these components exactly:

1. End User (Browser on laptop/mobile)
2. React + Vite Frontend
3. Auth Context + Protected Routes
4. Voice Practice Module
5. Presentation Practice Module
6. Profile + History Module
7. Frontend API Client (`localApi`)
8. `/api/local-data`
9. `/api/voice-chat`
10. `/api/presentation-analysis`
11. `/api/presentation-pause-feedback`
12. `/api/presentation-report`
13. `/api/admin-track`
14. LLM Router (`Zhipu -> LongCat fallback`)
15. Browser Speech APIs (`SpeechRecognition + SpeechSynthesis`)
16. Client PDF Processing
17. App Data Store (`Supabase REST or local JSON fallback`)
18. Admin Data Store (`Supabase REST or local JSON fallback`)

Required data flow:
- End User -> React + Vite Frontend
- React + Vite Frontend -> Auth Context + Protected Routes
- Auth layer -> Voice Practice Module
- Auth layer -> Presentation Practice Module
- Auth layer -> Profile + History Module
- Voice Practice Module -> Frontend API Client
- Presentation Practice Module -> Frontend API Client
- Profile + History Module -> Frontend API Client
- Voice Practice Module -> Browser Speech APIs
- Presentation Practice Module -> Client PDF Processing
- Frontend API Client -> all API endpoints
- voice / presentation AI endpoints -> LLM Router
- `/api/local-data` -> App Data Store
- `/api/admin-track` -> Admin Data Store
- `/api/local-data` also interacts with admin settings logic

Layout instruction:
- Put user and frontend on the left
- Put feature modules in the middle-left
- Put API routes in the center
- Put LLM router and browser capability blocks on the right-middle
- Put storage blocks at the far right or bottom-right
- Group related modules visually

Add a title at the top:
**System Architecture of SpeakNow**

## Prompt 2: Higher-Scoring Coursework Version

Generate a high-quality coursework-style system architecture diagram for a technical report.  
The system is a **React + Vite web application with serverless API routes, LLM orchestration, browser speech, PDF processing, and dual persistence (Supabase + local JSON fallback)**.

The output should look like a polished engineering diagram suitable for a university report.  
Use:
- rectangular labeled nodes
- subtle color coding by layer
- arrows for all major data flows
- grouped sections with faint boundaries

Use these visual groups:

Group A: Client Layer
- End User
- React + Vite Frontend
- Auth Context + Protected Routes
- Voice Practice Module
- Presentation Practice Module
- Profile + History Module
- Browser Speech APIs
- Client PDF Processing

Group B: Application Interface Layer
- Frontend API Client (`localApi`)

Group C: Server/API Layer
- `/api/local-data`
- `/api/voice-chat`
- `/api/presentation-analysis`
- `/api/presentation-pause-feedback`
- `/api/presentation-report`
- `/api/admin-track`

Group D: Intelligence Layer
- LLM Router
- Zhipu provider
- LongCat fallback provider

Group E: Data Layer
- App Data Store
- Admin Data Store
- Supabase REST
- Local JSON fallback

Important annotation notes to include visually if possible:
- "Login required on entry"
- "Admin-only dashboard"
- "PDF-only presentation upload"
- "Per-feature timeout + retry + fallback"

Make the final diagram easy to explain in a report section.

## Prompt 3: Chinese Version

请为一个大学课程技术报告生成一张专业、清晰、可直接插入 Word 的系统架构图。  
项目名称是 **SpeakNow**，这是一个基于 Web 的口语训练平台。

风格要求：
- 白色背景
- 学术报告风格
- 简洁、专业、不要卡通化
- 用浅蓝、青绿、紫色区分不同层
- 所有主要组件都要用方框表示
- 用箭头清晰表示数据流向
- 横向布局，适合报告插图

必须包含以下组件：
- 最终用户（浏览器 / 手机或电脑）
- React + Vite 前端
- Auth Context + Protected Routes
- 情景口语模块
- 演讲练习模块
- Profile + History 模块
- 前端 API Client（localApi）
- /api/local-data
- /api/voice-chat
- /api/presentation-analysis
- /api/presentation-pause-feedback
- /api/presentation-report
- /api/admin-track
- 大模型路由层（Zhipu -> LongCat fallback）
- 浏览器语音能力（SpeechRecognition + SpeechSynthesis）
- PDF 客户端处理
- 应用数据存储（Supabase REST 或 local JSON fallback）
- 后台数据存储（Supabase REST 或 local JSON fallback）

数据流要求：
- 用户进入前端
- 前端经过认证层进入不同功能模块
- 情景口语和演讲模块都通过 localApi 调用后端接口
- 语音相关接口和演讲分析接口都连接到大模型路由层
- /api/local-data 连接应用数据存储
- /api/admin-track 连接后台数据存储
- 情景口语模块连接浏览器语音能力
- 演讲练习模块连接 PDF 处理模块

图标题请写：
**SpeakNow 系统架构图**

## Prompt 4: If You Want Gemini To Draw A More Beautiful Version

Create a visually polished architecture diagram that looks like a startup product engineering overview slide, but still formal enough for university submission.

Make it:
- elegant
- modern
- minimal
- clearly layered
- readable at A4 size

Emphasize:
- user login gate
- admin authorization gate
- dual core features: scenario speaking and presentation rehearsal
- multi-provider LLM fallback
- Supabase + local JSON dual storage

Do not add any components that are not explicitly listed.  
Do not turn it into a cloud marketing poster.  
Keep it technical and structured.
