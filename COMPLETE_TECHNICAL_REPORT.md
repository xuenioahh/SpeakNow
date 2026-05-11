# SpeakNow Complete Technical Report

Module: ENT208TC Session 4 Group 25  
Project: SpeakNow  
Academic Year: 2025-2026

Team Members  
- Yujie Yang — 2363253
- Zihan Jiang — 2362327
- Yile Zhang — 2363305
- Xinyu Shen — 2363210
- Zhuoru Zhang — 2363097
- Zimu Zhang — 2364249
- Ye Li — 2362556

## 1. System Architecture

### 1.1 Architecture Diagram

```mermaid
flowchart TD
    U[End User<br/>Browser on laptop/mobile]
    R[React + Vite Frontend<br/>Pages, components, routing]
    A[Auth Context + Protected Routes<br/>Session + role gating]
    VC[Voice Practice Module<br/>Scenario setup, chat, report]
    PM[Presentation Module<br/>Upload, practice, feedback, report]
    PR[Profile + History Module<br/>Progress views]
    AC[Frontend API Client<br/>localApi]

    LD[/api/local-data<br/>Auth, CRUD, admin settings]
    VT[/api/voice-chat<br/>Structured LLM dialogue]
    PA[/api/presentation-analysis<br/>Slide analysis]
    PF[/api/presentation-pause-feedback<br/>Pause coaching]
    RP[/api/presentation-report<br/>Session report generation]
    AD[/api/admin-track<br/>Admin analytics stream]

    LLM[LLM Router<br/>Zhipu -> LongCat fallback]
    TTS[Browser Speech APIs<br/>SpeechRecognition + SpeechSynthesis]
    PDF[Client PDF Processing<br/>Upload + text extraction]

    APP[(App Data Store<br/>Supabase REST or local JSON fallback)]
    ADMIN[(Admin Data Store<br/>Supabase REST or local JSON fallback)]

    U --> R
    R --> A
    A --> VC
    A --> PM
    A --> PR
    VC --> AC
    PM --> AC
    PR --> AC
    VC --> TTS
    PM --> PDF

    AC --> LD
    AC --> VT
    AC --> PA
    AC --> PF
    AC --> RP
    AC --> AD

    VT --> LLM
    PA --> LLM
    PF --> LLM
    RP --> LLM

    LD --> APP
    AD --> ADMIN
    LD --> ADMIN
```

### 1.2 Component Overview

#### End User Browser
The browser is the runtime environment for the full learning experience. It captures typed input, microphone speech, uploaded PDF slides, and navigation events, while also rendering chat feedback, presentation coaching, reports, and the admin dashboard.

It is needed because the product is designed as a low-friction web app for quick access during practice and testing. Running in the browser also lets the system reuse built-in Web Speech APIs for microphone recognition and speech synthesis without requiring a native client.

#### React + Vite Frontend
The frontend is built with React and bundled by Vite. It contains route-level pages such as `AuthPage`, `VoiceSetup`, `VoiceChat`, `PresentationPractice`, `PresentationReport`, `Profile`, `VoiceHistory`, `PresentationHistory`, and `AdminPage`.

This layer is needed to provide a responsive single-page application with fast iteration speed, modular UI composition, and a clean separation between interaction logic and backend API logic. Vite keeps the local development cycle fast, which mattered during repeated UI and workflow refinement.

#### Auth Context and Protected Routing
`AuthContext` manages the authenticated user, admin status, loading state, and public settings. `ProtectedRoute` blocks access to the main app unless a user is logged in, while `AdminRoute` restricts `/admin` to users whose email resolves to an admin role.

This component is needed because the product must force login on each entry, separate learner and admin capabilities, and prevent ordinary accounts from seeing or opening the admin dashboard. The role is resolved from configured seed emails plus stored admin email settings.

#### Voice Practice Module
The voice practice flow includes scenario selection, role setup, live dialogue, instant feedback, text and audio response playback, and final session reporting. The main files are `src/pages/VoiceSetup.jsx`, `src/pages/VoiceChat.jsx`, `src/pages/VoiceReport.jsx`, and related voice components.

It is needed because scenario-based speaking practice is one of the project’s two core learning modes. The module simulates realistic conversational situations and combines prompt-guided LLM replies with structured coaching feedback.

#### Presentation Module
The presentation module supports PDF upload, document viewing, rehearsal flow, pause feedback, analysis generation, and final presentation reports. The relevant pages include `Presentation.jsx`, `PresentationAnalysis.jsx`, `PresentationPractice.jsx`, `PresentationFeedback.jsx`, and `PresentationReport.jsx`.

This component is needed because presentation rehearsal differs from conversational speaking: it is slide-driven, longer-form, and requires page-aware coaching. The module therefore adds PDF processing, pause-level feedback, and summary reporting tailored to presentation delivery.

#### Profile and History Module
The profile and history area aggregates user progress from stored voice sessions, presentation sessions, and activity records. It turns raw session data into visible trends that help learners review improvement over time.

It is needed because a training product should not only generate one-off feedback, but also preserve progress artifacts that motivate repeated use. This module also makes the system more maintainable by centralizing review functionality instead of scattering record access across feature pages.

#### Frontend API Client
`src/api/localClient.js` provides a consistent interface for authentication, entity CRUD, activity tracking, admin management, and LLM-backed integrations. The frontend uses this layer instead of calling each endpoint ad hoc.

It is needed to reduce coupling between UI code and API wiring. This makes route components simpler, eases refactoring, and allows backend behavior to evolve while keeping a stable frontend calling convention.

#### Local Data API
`/api/local-data` handles login, registration, “me”, user updates, voice and presentation session CRUD, activity storage, and admin email settings. It is the main application backend for authenticated product data.

It is needed because the frontend requires a single authoritative server-side entry point for persistence and access control. Even in local-first mode, keeping this logic in an API layer prevents direct browser tampering with stored records.

#### Feature AI Endpoints
The project uses separate endpoints for feature-specific inference: `/api/voice-chat`, `/api/presentation-analysis`, `/api/presentation-pause-feedback`, and `/api/presentation-report`. Each endpoint constructs its own prompt, schema, timeout profile, and fallback behavior.

These endpoints are needed because the four tasks have different latency and output-structure requirements. A single generic LLM endpoint would have been harder to tune and more fragile under provider failures.

#### LLM Router
`api/_llm.js` is a provider router that currently prioritizes Zhipu and falls back to LongCat. It performs structured JSON requests, per-provider model lists, one light retry for retryable errors, and module-specific timeouts.

It is needed because the project experienced unstable response quality, 401 errors, rate limits, and timeouts when relying on one provider. The router reduces operational risk by keeping the frontend stable even when an individual model or provider fails.

#### Browser Speech Layer
The application uses browser speech APIs for both user input and audio output. Speech recognition supports scenario speaking input, while `audioManager` uses `speechSynthesis` to play AI replies and spoken summaries.

This component is needed to create a more natural speaking experience than typed chat alone. It also reduces infrastructure cost because text-to-speech and basic voice input can run client-side instead of through a paid external speech stack.

#### Client PDF Processing
The presentation workflow accepts PDF uploads only and extracts page text for downstream coaching. This simplifies the upload pipeline and keeps document handling predictable.

It is needed because the presentation feature depends on slide-aware prompts and page cues. Restricting uploads to PDF reduced parsing ambiguity and removed a class of formatting bugs from unsupported file types.

#### App Data Store
The app persistence layer stores users, voice sessions, presentation sessions, activity records, and admin email settings. In production it can use Supabase through REST calls with a server-side service role key; otherwise it falls back to local JSON files.

This component is needed because the app must support both a coursework-friendly local mode and a production-like hosted mode. The dual-path design allowed the project to stay demoable during backend changes while still supporting online persistence.

#### Admin Data Store
The admin analytics store keeps user summaries, event logs, voice session snapshots, and presentation session snapshots. It also supports both Supabase-backed persistence and local JSON fallback.

It is needed because administrative monitoring has different access rules and retention goals from learner-facing data. Splitting app data and admin telemetry avoids mixing user workflow state with dashboard analytics.

### 1.3 Data Flow

#### Main learner flow: voice practice
1. A user opens the website and is forced through the login page.  
2. The frontend calls `localApi.auth.me()` through `/api/local-data` to validate the current session.  
3. After login, the user chooses a scenario and mode in the voice practice area.  
4. During live dialogue, the browser captures microphone input through speech recognition and converts it into text.  
5. `VoiceChat.jsx` sends the latest user utterance, selected scenario metadata, and compressed recent history to `/api/voice-chat`.  
6. `/api/voice-chat` builds a short task-specific system prompt, then sends a structured JSON request through the LLM router.  
7. The LLM router first tries Zhipu and, if needed, retries once for retryable failures before switching to LongCat.  
8. The returned JSON includes an AI reply plus structured feedback fields such as grammar, vocabulary, pronunciation, and task completion.  
9. The frontend renders the user bubble, the AI bubble, and optional voice playback through `audioManager`.  
10. When the session ends, a voice session record is saved through `/api/local-data` into the app store, and an admin event is also written through `/api/admin-track` into the admin store.  
11. The learner later reviews the report and history pages, which retrieve stored session data from the same app persistence layer.

#### Main learner flow: presentation practice
1. The user uploads a PDF deck from the presentation module.  
2. The browser processes the document and extracts page text for local context building.  
3. The frontend calls `/api/presentation-analysis` for high-level slide analysis and `/api/presentation-pause-feedback` during practice for short, fast coaching moments.  
4. At the end of the rehearsal, `/api/presentation-report` generates a more complete report with summarized strengths, weaknesses, and scoring outputs.  
5. The resulting presentation session is stored in the app store and mirrored into the admin analytics store.  
6. The learner can revisit history pages, while admins can inspect high-level session records in `/admin`.

#### Admin and monitoring flow
1. An admin logs in with an email that appears either in `VITE_ADMIN_EMAILS` or in stored admin settings.  
2. The frontend exposes the `/admin` route only for those users.  
3. The admin dashboard requests `/api/admin-track` and `listAdminSettings()` to load analytics and the current administrator list.  
4. The dashboard displays counts, events, voice sessions, presentation sessions, storage provider state, and admin email management controls.  
5. When the admin adds another admin email, the request goes through `/api/local-data`, updates settings, and future logins for that email resolve to the `admin` role.

## 2. Technology Justification

### 2.1 Technology Choice Table

| Technology / Tool | What we chose | Alternatives considered | Why we chose this |
| --- | --- | --- | --- |
| Frontend framework | React 18 | Vue 3, Next.js App Router, plain JavaScript SPA | React gave the team the broadest ecosystem support, easy component reuse, and smooth integration with routing, form handling, charts, and Radix UI. Vue was viable but would have required a stack change for a team already iterating in React. Next.js would have added SSR complexity that the product did not need because most interactions are authenticated, client-heavy, and media-driven. |
| Build tool | Vite | Create React App, Next.js, Webpack custom config | Vite provided faster cold starts and much faster HMR during frequent UI and prompt-tuning iterations. CRA is slower and increasingly dated. A custom Webpack setup would offer flexibility but at a configuration cost not justified for a student project. |
| Styling system | Tailwind CSS with shadcn-style Radix components | Material UI, Chakra UI, custom CSS only | Tailwind allowed rapid UI iteration while preserving precise control over visual hierarchy. Radix primitives improved accessibility and interaction quality without locking the team into a rigid theme. Material UI would have accelerated basic screens but risked making the product look generic and harder to align with the project’s custom visual language. |
| Routing | React Router | Next.js file routing, Wouter | React Router fits a pure SPA well and supports protected routes cleanly. Next.js routing would be strongest in a server-rendered application, which this project is not. Wouter is lighter, but React Router provides clearer conventions for a growing multi-page application. |
| State for async data | TanStack Query | Redux Toolkit, Zustand, manual fetch state | Query was chosen for server-state style flows such as loading auth state, reports, and dashboard data. Redux would be more powerful for large global state graphs, but it would be excessive here. Manual state handling was possible, but would create duplicated loading and error logic across pages. |
| Backend pattern | Vercel serverless API routes plus local Node dev server | Full Express backend, Firebase Functions, Supabase Edge Functions | API routes matched the current deployment target and kept backend logic close to the frontend repo. A full Express service would offer more control, but it would increase deployment surface area and ops overhead. This hybrid approach gave the project a lightweight production backend while preserving local development through `backend/server.js`. |
| App persistence | Supabase REST with service-role key on server, local JSON fallback | Pure localStorage, Firebase Firestore, self-hosted PostgreSQL | Supabase was chosen because it provides a simple hosted PostgreSQL path without requiring the team to manage infrastructure. However, a local JSON fallback was retained because coursework demos and iterative development sometimes needed to keep working without a fully stable hosted database. Pure localStorage was rejected for authoritative shared data because it is browser-bound and easier to tamper with. |
| Admin persistence | Separate admin tables / JSON store | Reusing the learner tables only, Google Sheets, Airtable | Admin telemetry was separated from learner-facing records to avoid mixing analytics concerns with core product data. Reusing the same store would simplify implementation but make data governance and dashboard queries messier. Spreadsheet-backed telemetry would be easy to inspect manually, but weak for structured querying and future scale. |
| LLM provider strategy | Multi-provider router: Zhipu primary, LongCat fallback | OpenAI only, OpenRouter only, single free model provider | The project initially encountered invalid key issues, rate limits, and provider-specific failures. A multi-provider router improved resilience and kept user workflows alive during transient outages. A single premium provider would simplify implementation, but would increase cost and create a harder single point of failure. |
| LLM response format | Structured JSON outputs with per-feature schemas | Free-form natural language parsing, regex extraction only | Structured JSON makes downstream rendering more reliable because the frontend can expect fixed fields. Free-form text would be easier to prototype but much more brittle, especially for voice feedback, pause coaching, and report generation where sections must map to UI slots. |
| Speech input / output | Browser Web Speech APIs | Dedicated STT/TTS cloud services, Azure Speech, Google Cloud Speech | Browser-native speech features were selected to minimize cost and reduce dependency overhead. They are imperfect across browsers, but acceptable for a coursework prototype and rapid deployment. Cloud speech services would improve quality and consistency, but at the cost of extra billing, latency, and more complex credential management. |
| Presentation file format | PDF-only upload | PPTX, DOCX, image sets, arbitrary file support | PDF-only support reduces parsing variability and simplifies the document analysis path. Supporting PPTX or DOCX would broaden usability, but also introduces more extraction edge cases and more test surface. Restricting format scope was a deliberate trade-off to improve stability before user testing. |
| Authentication model | App-managed email/password with forced login | Supabase Auth, OAuth, magic links | A custom lightweight auth flow was chosen because it fit the local-first fallback architecture and could be implemented consistently across both JSON and Supabase-backed persistence. Supabase Auth would be more robust in production, but would couple identity too early to a hosted service when the rest of the stack still needed a local fallback path. |
| Deployment target | Vercel | Netlify, Railway, Render | Vercel fit the SPA + serverless API route model well and made repeated production redeploys fast. Railway or Render would be stronger for a heavier long-running backend, but the current architecture benefits from Vercel’s low-friction frontend deployment workflow. |

### 2.2 Technical Risks and Mitigation

The largest technical risk was reliability in the AI layer. Different providers had different timeout behavior, authentication conventions, and failure patterns, which created user-visible fallback responses and inconsistent latency. To mitigate this, the project introduced provider routing, per-feature timeout settings, one light retry on retryable errors, and feature-specific prompt compression so that requests stay smaller and faster.

The second major risk was persistence inconsistency across development and production. Local development originally relied on filesystem-backed JSON, while Vercel’s serverless runtime does not preserve writable local files across invocations. This was mitigated by adding a Supabase-backed production path and keeping local JSON only as a fallback, with `/tmp` handling for serverless compatibility where applicable.

The third risk was voice UX instability. Browser speech recognition and speech synthesis can behave differently across devices and browsers, leading to lag, playback stutter, or missing audio. The mitigation strategy was pragmatic rather than perfect: shorten silence thresholds, reduce auto-play usage, chunk TTS playback, and always preserve a text-first fallback so the speaking workflow remains usable even when audio is imperfect.

## 3. Deployment Guide

### 3.1 Environment Requirements

| Requirement | Version / Notes |
| --- | --- |
| Node.js | 18.x or newer recommended |
| npm | 9.x or newer |
| Browser | Recent Chrome strongly recommended for speech features |
| Vercel CLI | Optional for production deployment |
| Supabase project | Required for durable hosted production storage |
| Operating system | macOS, Windows, or Linux for local development |

### 3.2 Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `ZHIPU_API_KEY` | Primary LLM provider key |
| `ZHIPU_MODEL` | Primary model, currently `glm-4.7-flash` |
| `LONGCAT_API_KEY` | Fallback LLM provider key |
| `LONGCAT_MODEL` | Fallback model, currently `LongCat-Flash-Lite` |
| `SUPABASE_URL` | Supabase project URL for server-side REST access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for data sync |
| `VITE_ADMIN_EMAILS` | Comma-separated seed admin emails |
| `ADMIN_DASHBOARD_KEY` | Optional extra protection for admin endpoint |

### 3.3 Setup Steps

1. Clone the repository.

```bash
git clone https://github.com/xuenioahh/SpeakNow.git
cd SpeakNow
```

2. Install dependencies.

```bash
npm install
```

3. Create an environment file for local development.

```bash
cp .env.example .env.local
```

4. Edit `.env.local` and fill in the required variables.

Example:

```env
ZHIPU_API_KEY=your_zhipu_key
ZHIPU_MODEL=glm-4.7-flash
LONGCAT_API_KEY=your_longcat_key
LONGCAT_MODEL=LongCat-Flash-Lite
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VITE_ADMIN_EMAILS=zhangyz1003@foxmail.com
```

5. Prepare Supabase tables if you want durable hosted persistence.

Run the SQL in:
- `supabase/app_schema.sql`
- `supabase/admin_schema.sql`

6. Start local development.

```bash
npm run dev
```

This starts:
- the Vite frontend
- the local Node backend for `/api/*`

7. Open the local URL shown in the terminal and verify login.

Expected checks:
- unauthenticated users are sent to the login page
- authenticated users can access `/`
- non-admin users do not see the admin entry point
- admin users can open `/admin`

8. Build the project before deployment.

```bash
npm run build
```

9. Deploy to Vercel.

```bash
npx vercel --prod
```

10. Configure the same environment variables in the Vercel project dashboard.

Production must have:
- `ZHIPU_API_KEY`
- `ZHIPU_MODEL`
- `LONGCAT_API_KEY`
- `LONGCAT_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_ADMIN_EMAILS`

### 3.4 Verification Checklist

After deployment, verify the following:
- the production URL loads without a blank screen
- login and registration work
- voice chat returns AI replies
- presentation upload accepts PDF only
- reports can be generated
- `/admin` is visible only to admin emails
- new session data appears in the admin dashboard

### 3.5 Common Issues and Solutions

| Problem | Likely cause | Solution |
| --- | --- | --- |
| `Incorrect email or password` on production after a seemingly valid login | The user account was not yet registered in the current production data store, or the app switched from local fallback to Supabase-backed storage | Register the account again in the current environment, then log in. Confirm that production points to the intended Supabase project. |
| `Admin Access Required` even for the seed admin email | `VITE_ADMIN_EMAILS` was missing or not set correctly in Vercel, or the user had not refreshed role resolution after sign-in | Recheck the exact environment variable in Vercel, redeploy, then sign out and sign in again. |
| `ENOENT: no such file or directory, mkdir '/var/task/data'` | Serverless deployment attempted to write to a non-persistent filesystem path | Use the updated storage path strategy and Supabase-backed persistence in production rather than relying on `/var/task`. |
| Voice input or playback behaves inconsistently | Browser speech APIs differ by browser/device and may block microphone or synthesis permissions | Test in recent Chrome, allow microphone access, and rely on text fallback if browser speech support is incomplete. |
| Admin dashboard is empty | Admin events were not yet generated, or the dashboard is pointed at a different storage provider than expected | Create a test login and session, then refresh `/admin`. Also check whether the provider label shows `supabase` or `local-json`. |

## 4. IP Strategy

### 4.1 Novelty Analysis

The genuine novelty of SpeakNow is not the isolated use of an LLM, a PDF uploader, or a speaking chatbot. The novel contribution is the integration of multiple speaking-practice modes inside one continuous learner workflow: scenario conversation, presentation rehearsal, persistent progress tracking, and an admin-observable evaluation pipeline. Instead of treating speaking as one generic chat interface, the system adapts prompting, feedback structure, timing, and stored outputs to the practice context.

Compared with many single-purpose speaking tools, SpeakNow combines low-latency dialogue coaching and slide-aware presentation feedback under the same account model and reporting structure. The project also implements a pragmatic dual-storage architecture that supports both local-first demonstration and hosted production persistence, which was essential for maintainability and classroom evaluation.

The strongest product-level novelty is therefore workflow integration rather than a single algorithmic breakthrough. The system unifies:
- guided scenario speaking
- page-aware presentation rehearsal
- structured AI feedback
- persistent learner records
- admin-side monitoring and role control

### 4.2 Prior Art

| Existing product / patent | What it does | How SpeakNow differs |
| --- | --- | --- |
| IELTS Speaking Simulator (JoeSpeaking) | An LLM-based speaking simulator with voice dialogue and score-style feedback for IELTS practice. | SpeakNow is broader in task design: it supports both scenario speaking and presentation rehearsal, not only IELTS-style dialogue. It also includes built-in admin telemetry and a unified learner history layer. |
| Real-Time AI-Driven Speaking Suggestions During Asynchronous Video Capture (US Patent App. 20240330380) | Uses AI suggestions during video capture, mainly for one-way recorded speaking contexts. | SpeakNow focuses on interactive, bidirectional practice and slide-linked coaching rather than asynchronous overlay suggestions during recording. It is optimized for conversational response loops and presentation rehearsal workflows. |
| Intelligent English-Speaking Training System Using Generative AI and Speech Recognition (MDPI, 2025) | Uses generative AI and speech recognition to support language speaking practice and feedback generation. | SpeakNow differs by combining practical web deployment, session persistence, admin review capability, and scenario-specific feature modules tailored to user workflows rather than only describing a generalized training pipeline. |

### 4.3 Patent Decision

Patent decision: No.

The main reasons are cost, novelty type, and enforceability. First, as a student team, we do not have the budget or time horizon required for formal software patent filing and prosecution. Second, the project’s value lies more in system integration, prompt engineering, workflow design, and iterative UX tuning than in a clearly separable patentable technical mechanism. Third, even if some claims were filed, enforcing them against similar educational software products would be difficult.

### 4.4 Alternative Protection Strategy

Instead of patenting, the more realistic protection strategy is:
- trade secrets for prompt structures, scoring heuristics, and report templates
- private operational knowledge about fallback routing and latency tuning
- first-mover advantage in a clearly defined student speaking-practice niche
- accumulated usage data that improves prompts, scoring, and UI decisions over time

This is a better fit for the current maturity of the product. The defensible value is in iteration speed, product refinement, and internal tuning rather than in a single patentable invention.

## 5. Limitations and Future Work

### 5.1 Known Limitations

| Limitation | Why it exists | Impact on users |
| --- | --- | --- |
| Browser speech reliability is inconsistent | The system uses native browser speech APIs to control cost and reduce backend complexity | Some users experience lag, playback stutter, recognition dropouts, or browser-specific behavior differences |
| AI response quality can still vary | The project depends on external model providers with different latency and style patterns | Users may occasionally receive fallback-style replies or shorter-than-ideal feedback when providers are slow |
| Authentication is functional but lightweight | The app currently uses a custom email/password flow instead of a full managed identity platform | Security, password recovery, and account lifecycle controls are weaker than a production-grade auth stack |
| Production persistence depends on correct environment setup | The system supports both local fallback and Supabase-backed storage, which increases configuration complexity | Misconfigured environments can cause empty dashboards, missing admin roles, or confusion over where data is stored |
| Presentation input is limited to PDF | File support was narrowed intentionally to reduce parser instability | Users with PPTX or other formats must convert files before practicing |
| Admin dashboard is operational rather than analytical | The current dashboard focuses on counts, records, and exports instead of deep analytics | Admins can inspect activity, but trend analysis and cohort insights are still limited |

### 5.2 Future Work

- Replace the lightweight custom auth flow with a managed authentication provider such as Supabase Auth to improve security, session handling, and password reset flows.
- Introduce stronger speech infrastructure, such as dedicated cloud STT/TTS, for a more reliable speaking experience across browsers and devices.
- Expand document ingestion beyond PDF to include PPTX and richer speaker-note handling.
- Improve the admin dashboard with aggregation views, trend charts, filters, and export presets for research or teaching use.
- Add richer user modeling in the profile area, such as longitudinal skill progression and personalized study recommendations.
- Continue reducing prompt rigidity so that pause feedback and presentation reports feel less templated while remaining fast and stable.
- Add automated tests for authentication, admin access control, and critical API routes to reduce regression risk during rapid iteration.

## References

Chen, Y.-Y., Hsiao, T.-H., & colleagues. (2025). *An intelligent English-speaking training system using generative AI and speech recognition*. Applied Sciences, 16(1), 189. https://www.mdpi.com/2076-3417/16/1/189

JoeSpeaking / IELTS Speaking Simulator. (n.d.). *GitHub repository*. https://github.com/hubeiqiao/IELTS-Speaking-Simulator

Real-time AI-driven speaking suggestions during asynchronous video capture. (2024). *U.S. Patent Application No. 20240330380*. https://patents.justia.com/patent/20240330380
