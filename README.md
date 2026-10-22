# SpeakNow

Current repair status: [2026-10-13 progress and verification](docs/repair-progress-2026-10-13/REPORT.md). This report describes the local working tree; the deployed website has not been verified against these changes. Earlier completion reports are historical snapshots.

SpeakNow is a speaking-practice web application built for `ENT208TC Session 4 Group 25`. It combines scenario-based voice conversation, presentation rehearsal, progress tracking, reporting, and admin-side monitoring in one React + Vite project.

## Live Demo

- Website: `https://omniverse-ent208.vercel.app`
- Repository: `https://github.com/xuenioahh/SpeakNow`

## Project Scope

The product supports two main communication workflows:

- voice conversation practice for scenario-based speaking tasks
- presentation rehearsal with an optional PDF, audience context, evidence-based coaching and targeted retries

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
- scenario-based voice conversation practice
- presentation rehearsal with PDF upload and slide-aware feedback
- session reports and practice history
- profile page with progress summaries
- admin dashboard with activity and session visibility
- explicit local development storage or hosted persistence; cloud failures are reported without switching to local storage

## User Flow

### Voice Practice

1. Sign in to the app.
2. Choose a speaking scenario.
3. Configure the session mode.
4. Complete a live voice practice session.
5. Review the generated feedback report and history.

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
