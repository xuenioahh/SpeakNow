# SpeakNow

Latest local version: [2026-11-01 restored NPC opening, right conversation panel, refined light UI and service verification](docs/ui-restoration-2026-10-31/REPORT.md). Previous voice/VIP/exam work: [2026-10-31 report](docs/full-product-2026-10-31/REPORT.md). TOEFL, IELTS and Daily Conversation share recording checks and speech assessment integration. Feedback includes bounded recovery; VIP includes a seven-day trial, finite allowances and administrator provisioning. Repetition references stay hidden during an exam. The interface and 3D scene backdrop are light. Azure Speech credentials are still required for live pronunciation scores. This local version has not been deployed.

Question-bank baseline: [2026-10-29 IELTS banks and verification](docs/ielts-2026-10-29/REPORT.md), following the [2026-10-24–25 core flow](docs/core-flow-2026-10-24/REPORT.md). The local version opens with Exam Practice and Daily Conversation. TOEFL has two task types; IELTS has Part 1, Part 2 and Part 3 banks imported from the two supplied September–December 2026 PDFs. Both use preparation/practice routes, recordings, feedback and linked retries. These changes have not been deployed to production.

Earlier repair status: [2026-10-13 progress and verification](docs/repair-progress-2026-10-13/REPORT.md). This report describes the local working tree; the deployed website has not been verified against these changes. Earlier completion reports are historical snapshots.

SpeakNow is a speaking-practice web application built for `ENT208TC Session 4 Group 25`. It combines scenario-based voice conversation, presentation rehearsal, progress tracking, reporting, and admin-side monitoring in one React + Vite project.

## Live Demo

- Website: `https://omniverse-ent208.vercel.app`
- Repository: `https://github.com/xuenioahh/SpeakNow`

## Project Scope

The product supports two main communication workflows:

- TOEFL / IELTS Speaking: choose an exam, task type, question set or single question, practise and review
- Daily Conversation: choose a real-life scenario and conversation goal, then practise

Presentation rehearsal remains available through the secondary navigation, with an optional PDF, audience context, evidence-based coaching and targeted retries.

The current version includes authentication, protected routes, report generation, history pages, profile insights, and admin-facing analytics. The app is designed to remain reviewable both as a deployed website and as a local-first coursework codebase.

## Team

- Yujie Yang — `2363253`
- Zihan Jiang — `2362327`
- Yile Zhang — `2363305`
- Xinyu Shen — `2363210`
- Zhuoru Zhang — `2363097`
- Zimu Zhang — `2364249`
- Ye Li — `2362556`

## Main Features

- register and sign-in flow with protected routes
- TOEFL: 49 Listen and Repeat sets (340 sentences) and 77 Take an Interview sets (288 questions)
- IELTS: 47 Part 1 topics (362 questions), 36 Part 2 topics (39 cue cards), and 28 Part 3 topics (134 questions)
- IELTS cue cards, preparation notes, 60/120-second Part 2 stages, related Part 3 discussions, and supplied reference answers after answering
- whole-set or single-question practice, search, progress, session recovery and linked retries
- scenario-based voice conversation practice
- presentation rehearsal with PDF upload and slide-aware feedback
- session reports and practice history
- profile page with progress summaries
- admin dashboard with activity and session visibility
- explicit local development storage or hosted persistence; cloud failures are reported without switching to local storage

## User Flow

### TOEFL Practice

1. Choose Exam Practice on the homepage.
2. Choose Listen and Repeat or Take an Interview.
3. Search the corresponding bank and choose a set or one question.
4. Start from the preparation page, record, and confirm your transcript.
5. Continue through the actual selected questions, then review recordings and feedback.
6. Retry the selected question/set or return to its bank. Sign in when you want an account copy.

### Daily Conversation

1. Choose Daily Conversation, then a scenario.
2. Choose a conversation goal; scene preview and camera options are optional.
3. Start the conversation and speak or type your reply.
4. Review the saved practice, request feedback, and retry. Anonymous practice stays on the device.

### Question-bank sources

The generated catalogue is in `shared/question-bank/`. Source extracts, hashes, page/line locators, duplicates and anomalies are retained beside it. The supplied materials are recalled practice, not official ETS items; source reference answers appear only after answering. No original question audio was supplied. Playback uses browser-generated speech.

`python3 scripts/import-question-bank.py` imports the supplied PDF/DOCX and text companions; use `--repeat-pdf`, `--interview-docx`, and repeatable `--repeat-text` arguments for other local paths. The PDF extractor uses macOS PDFKit; the checked-in catalogue is ready to run without importing again. Failed imports preserve the current catalogue. See the [import and validation report](docs/core-flow-2026-10-24/REPORT.md) for exact inputs and the missing second PDF copy.

### Presentation Practice

1. Sign in to the app.
2. Enter a topic, core message, desired outcome and audience; optionally attach a PDF.
3. Record an attempt, review the transcript and save it.
4. Review model coaching when the server has a configured provider.
5. Retry a selected moment and compare the independent attempts.

## Technology Stack

- React 18
- React Router
- Vite
- Tailwind CSS
- Radix UI / shadcn-style components
- TanStack Query
- Vercel API routes
- Supabase-backed storage or explicitly configured local development storage

## Screenshots

### Presentation feedback

![Presentation feedback](./docs/images/presentation-feedback.png)

### Voice practice report

![Voice practice report](./docs/images/voice-report.png)

## Access

Use the live website directly:

- `https://omniverse-ent208.vercel.app`

For the current local version, run `npm run dev` in this directory. The launcher keeps the frontend origin and backend configuration aligned. Use an isolated `SPEAKNOW_DATA_DIR` and `FORCE_LOCAL_DATA=true` for test data. Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` for the automated checks.

An existing hosted installation needs [repair_2026_10_13.sql](supabase/repair_2026_10_13.sql) before deploying this repair. The migration has been prepared but has not been applied to a live database. New installations use the existing schema and consolidation scripts.

## Repository Structure

- `src/pages/` route-level application pages
- `src/components/` reusable feature and UI components
- `src/lib/` storage, business logic, and shared utilities
- `src/api/` frontend-side API wrappers
- `api/` server-style endpoints for analysis, persistence, and admin tracking
- `backend/` local development backend entry
- `public/` static assets
- `supabase/` schema files for hosted persistence
- `docs/images/` README screenshot assets

## Access Notes

- browser microphone permission is required for voice practice
- camera permission is required only for camera-based features
- a PDF is optional; model feedback requires a configured server provider
- the deployed website may require a VPN in mainland China

## Additional Documents

- [RELEASE_NOTES.md](./RELEASE_NOTES.md)
- [ADMIN_BACKEND_SETUP.md](./ADMIN_BACKEND_SETUP.md)
- [COMPLETE_TECHNICAL_REPORT.md](./COMPLETE_TECHNICAL_REPORT.md)
- [COMPLETE_TECHNICAL_REPORT_BILINGUAL.md](./COMPLETE_TECHNICAL_REPORT_BILINGUAL.md)

Latest core-flow audit and validation: [2026-10-24–25 implementation report](docs/core-flow-2026-10-24/REPORT.md).
