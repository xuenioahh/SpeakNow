# SpeakNow

SpeakNow is a speaking-practice web application built for `ENT208TC Session 4 Group 25`. It combines scenario-based voice conversation, presentation rehearsal, progress tracking, reporting, and admin-side monitoring in one React + Vite project.

## Live Demo

- Website: `https://omniverse-ent208.vercel.app`
- Repository: `https://github.com/xuenioahh/SpeakNow`

## Project Scope

The product supports two main communication workflows:

- voice conversation practice for scenario-based speaking tasks
- presentation rehearsal for slide-based speaking tasks

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
- local-first fallback behaviour with hosted persistence support

## User Flow

### Voice Practice

1. Sign in to the app.
2. Choose a speaking scenario.
3. Configure the session mode.
4. Complete a live voice practice session.
5. Review the generated feedback report and history.

### Presentation Practice

1. Sign in to the app.
2. Upload a PDF or prepare presentation material.
3. Rehearse the presentation flow.
4. Receive analysis and pause-level feedback.
5. Review the final report and saved history.

## Technology Stack

- React 18
- React Router
- Vite
- Tailwind CSS
- Radix UI / shadcn-style components
- TanStack Query
- Vercel API routes
- Supabase-backed storage with local fallback support

## Screenshots

### Presentation feedback

![Presentation feedback](./docs/images/presentation-feedback.png)

### Voice practice report

![Voice practice report](./docs/images/voice-report.png)

## Access

Use the live website directly:

- `https://omniverse-ent208.vercel.app`

No local setup is required for review. The source code is provided for inspection only, and reviewers are not expected to run the project locally. All normal access, testing, and demonstration should be completed through the deployed website.

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
- a text-based PDF is recommended for presentation rehearsal testing
- the deployed website may require a VPN in mainland China

## Additional Documents

- [RELEASE_NOTES.md](./RELEASE_NOTES.md)
- [ADMIN_BACKEND_SETUP.md](./ADMIN_BACKEND_SETUP.md)
- [COMPLETE_TECHNICAL_REPORT.md](./COMPLETE_TECHNICAL_REPORT.md)
- [COMPLETE_TECHNICAL_REPORT_BILINGUAL.md](./COMPLETE_TECHNICAL_REPORT_BILINGUAL.md)
