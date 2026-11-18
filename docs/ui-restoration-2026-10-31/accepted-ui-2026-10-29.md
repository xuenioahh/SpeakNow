# SpeakNow — 2026-10-29 local UI update

Latest preview: **http://localhost:5173/**. Start it with `npm run dev` in this project. This record describes the local implementation, not a production deployment.

## Navigation

One fixed application header provides Home, Speaking, Exams, History and Progress. It appears before authentication finishes and stays in the same position across routes. The duplicate homepage menu and page-local bottom menus have been removed. Account settings remain separate from primary navigation.

## 3D conversation

The desktop scene uses the left side; a large scrollable conversation panel occupies the right. Both sides of the dialogue, incoming AI text, replay and the reply controls share this panel. It follows new replies, preserves the position while reading history, provides a jump to the latest message and keeps the latest reply visible after resizing. Mobile uses a scene above a substantial conversation panel with visible controls. Camera and detailed live metrics are under Options.

NPCs open with a scene question, finish speaking before capture starts and lead subsequent turns with a relevant next question. DeepSeek configuration is loaded from the ignored `.env.local` before `.env`.

## Feedback and progress

Feedback prioritises the personal summary, up to two strengths and up to three corrections supported by an exact quote from the learner. Each correction links to the original answer and a targeted retry. Answers, recordings, optional video, comparison and deletion remain available without dominating the page. Unsupported observations, metric inventories and empty score panels have been removed from the main view.

Progress replaces the decorative journal, illustration and music with practice counts, activity, known recorded time, recurring feedback topics and recent practices. It merges account and device attempts with legacy account records by practice ID, checks ownership, excludes invalid dates and counts only actual recorded durations. A weak point must have a matching original quote; counts refer to distinct practices, not the number of suggestions in one report. Missing evidence produces no invented score or weak-point card. These are patterns in saved coaching feedback, not a measurement of learning gains.

## Verification

- 14 focused automated checks: opening-before-capture, long conversations, failure/retry, record ownership and deduplication, missing durations, date/track filters and quoted feedback evidence.
- Browser checks: stable navigation on five main routes, account settings, record filters, cited-answer expansion, targeted retry, long transcript scrolling, preserving reading position and following the latest reply after resizing.
- Desktop, 390 px and 320 px layouts checked; browser runtime errors: none.
- Production build, TypeScript and ESLint checks passed.

Browser checks use an isolated account, controlled saved records and a controlled streaming reply. They do not modify real user records or establish the quality of feedback on the user's actual history. Earlier real DeepSeek checks in this session confirmed conversation replies and explicit session-ending behaviour.

Screenshots and the browser results are stored beside this file.
