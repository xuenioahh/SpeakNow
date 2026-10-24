# SpeakNow product and learning-loop implementation

Implemented 2026-10-23–24, Asia/Shanghai. Baseline: `25354395f75b3cd5a42529e822a1c27998ee3df6` in `ent208/Omniverse`.

## Scope and evidence boundaries

This is an implementation in the existing React/Vite + Node.js app. Existing presentation/Expression Lab functionality, protected account APIs, scene rendering and the Three.js Orb are retained. No production deployment or production database modification was performed in this implementation pass. No model keys are placed in the frontend.

Tests verify engineering behaviour, not human learning outcomes, official exam scoring, production Supabase availability, natural ASR accuracy or physical mobile GPU/device performance. Browser screenshots contain prominently labelled engineering model fixtures; these are not production responses.

## Baseline feature audit

| Area | Before this pass | Evidence / disposition |
| --- | --- | --- |
| Home and entry flow | Implemented but inconsistent with requested positioning | Presentation-first MainLanding; conversations marked optional; all core routes behind login. Replaced primary entries with exams/daily, retained secondary features. |
| TOEFL / IELTS | Partially implemented | `examStandards.js` and scoring selection existed; no dedicated tasks or exam timers. Removed legacy linear score conversion; added five separate flows. |
| Voice interaction | Implemented and verified with controlled tests | Existing VoiceCapture/VoiceInteraction handles pending permissions, exact turn identity, cancellation, recognition finalisation and playback. Reused and extended. |
| 3D Orb | Implemented and verified with lifecycle/renderer tests | Three.js shader uses real microphone RMS when available, state-driven colour/flow, DPR limits, reduced motion and WebGL fallback. Core renderer unchanged. Browser TTS provides no PCM amplitude: playback state is displayed, no fake TTS energy is added. |
| Daily summary | Partially implemented | `voice-report` dispatch returned local heuristic `generateVoiceReport`, not model inference. Existing legacy report retained, new flow uses server-generated evidence-checked feedback. |
| Recording and replay | Partial for daily conversations | Existing browser recognition did not durably store daily audio. Added same-stream MediaRecorder, IndexedDB clips, authenticated private media upload/readback. |
| Retry and comparison | Not implemented for these two tracks | Added immutable attempt IDs, task/version snapshot, parent links, full-task retry, focused exam-question retry and side-by-side transcripts/recordings. |
| Cloud data / authentication | Implemented; production not revalidated in this pass | Real Supabase REST and private Storage adapters exist, with local-mode alternatives and server authentication/CSRF/ownership checks. New cloud path reuses them, tested with isolated file-backed adapters. |
| Daily visual hierarchy | Implemented but cluttered | Duplicate studio/scoring/status text, examiner card, expanded feedback, inline visual cards and full conversation. Simplified as listed below. |
| Historical data | Implemented | Old VoiceHistory and presentation history remain. Learning records link to the new review; old score scales are not rewritten. |

## Official exam basis

Checked official sources on 2026-10-23:

- [ETS Speaking task types](https://www.ets.org/toefl/test-takers/ibt/about/content/speaking.html): Listen and Repeat and Take an Interview.
- [ETS score scales](https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html): 1–6 with half-point increments from 21 January 2026. Prior 0–30 results are not linearly rescaled by the app.
- [ETS test overview](https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-test-overview.pdf): interview contains four questions, 45 seconds each.
- [IELTS Speaking format](https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking): three parts; Part 2 includes one minute preparation and up to two minutes speaking; Part 3 discusses the Part 2 topic more abstractly.
- [IELTS preparation guidance](https://ielts.org/news-and-insights/how-to-use-the-preparation-time-in-ielts-speaking-part-2).

All starter questions are original simulations. TOEFL repetition uses a clearly labelled 12-second practice cap, and IELTS Parts 1/3 use labelled per-answer practice caps rather than pretending to reproduce a full examiner-led test. Part 2 includes a cue card and 60/120-second stages, with an explicit early finish for preparation in practice mode. It does not yet implement examiner follow-up after the long turn. No official question bank or full mock-test certification is claimed.

## Changes and data model

- `shared/speakingTasks.js`: separate task definitions; exam/version/type, prompts, timing, audio slot, source, updated date and revision. Shared attempt and feedback validation; ordered word alignment for Listen and Repeat, labelled transcript comparison rather than pronunciation assessment.
- `src/pages/ExamSpeaking.jsx`, `ExamPractice.jsx`: direct task entry, prompt playback, hidden repetition reference until recording ends, preparation/answer timers, recording, transcript review, permission/playback recovery, durable drafts and task/question retries.
- `src/pages/LearningReview.jsx`, `LearningHistory.jsx`: four-part review, 1–3 quoted improvement targets, retry links, two-attempt playback, device/cloud status, unfinished-practice continuation, saved attempts and next-focus suggestions.
- `src/lib/learningStore.js`, `voice/AudioTake.js`, `components/LearningAudio.jsx`: IndexedDB attempts/drafts/audio; cloud synchronization and private replay; explicit save failure, object-URL cleanup and bounded recorder finalisation. Client media cache is scoped by the owning attempt; account history filters out other account owners.
- `api/speaking-feedback.js`, `_trialGuard.js`: transcript-grounded model output validation. Quotes must be literal substrings of actual answers. Anonymous inference is origin-checked, rate-limited and subject to the shared model budget. It cannot access account history or media. Invalid auth cookies are not downgraded to anonymous access. Provider failures return errors, not invented successful feedback.
- `api/speaking-practice.js`: authenticated owned save/list/get and private upload/read. Retry must refer to an owned matching task. Repeated saves/uploads are idempotent; changed saved text/audio is rejected. Authenticated feedback is generated from the server-held attempt and persisted server-side.
- `src/lib/voice/VoiceCapture.js`, `VoiceInteraction.js`, `pages/VoiceChat.jsx`: same-stream recording, refreshed-conversation recovery, recorded-turn identity and new review handoff; reuse existing cancellation and state machinery.
- `src/App.jsx`, `pages/AuthPage.jsx`, `components/BottomNav.jsx`: public practice routes; login returns to the pending attempt. Existing account/admin/presentation routes remain protected.
- `src/pages/MainLanding.jsx`, `Home.jsx`, `components/voice/ChatMessage.jsx`, `RecordingControls.jsx`, `voice-room.css`, `learning.css`: primary navigation and visual hierarchy changes.
- `backend/server.js`: bounded upload body size for the new authenticated media endpoint.
- `src/lib/examStandards.js`, `scripts/check-exam-standards.mjs`: no fabricated conversion of legacy TOEFL scores; 2026 range is bounded at 1–6.
- `src/pages/VoiceHistory.jsx`: existing learning rows open their proper review; other legacy records retain their display.
- `tests/learning/*`, `package.json`: model/storage/security tests, isolated fixture server and browser acceptance suite integrated into verification.

New records use existing `app_voice_sessions.report.learning` JSONB. Top-level columns retain existing names; no SQL migration or rewriting of old rows is required. Each attempt contains its own ID, parent ID, exam/type, immutable task snapshot, source/version, answers, per-answer recording IDs and feedback provenance. Private audio reuses `speaknow-recordings` and the existing server-only Storage adapter. Existing installations still need the previously documented consolidation/auth schema and private bucket; this pass does not silently create or migrate a production database.

## Visual simplification

- Home: two primary cards; presentation and Expression Lab move under “More ways to practise”.
- Daily entry: scenario and difficulty followed by one start action; scene preview is optional. Legacy setup routes remain for existing links.
- Daily practice: removed duplicate studio subtitle/scoring label and the separate examiner card; one main interaction status beside the retained Orb.
- Shows the latest exchange by default; earlier conversation, coach notes, visual cues and voice settings are expandable.
- Model identifiers are removed from the compact conversation header. Transcript appears when recording or when recognised text is present, rather than as a permanent empty card.
- Mobile puts microphone controls ahead of the longer conversation panel; the start microphone action is verified within the initial 390px viewport.

## Validation

- `npm test`: 56 tests passed; baseline 47 tests retained; learning tests added for task distinction, source/version, evidence rejection, anonymous restrictions, immutable retries, account isolation, private media, model outage and server-generated feedback, plus repetition alignment.
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `node scripts/check-voice-interaction.mjs`: existing ten groups covering turn locks, stale requests, timeouts, permission ownership, native restart, RMS endpoint detection, pagehide/device cleanup and retained drafts.
- `node scripts/check-voice-recording.mjs`: existing interaction checks and actual React recording controls.
- `node scripts/check-orb-lifecycle.mjs`: one animation loop, real RMS consumption, visibility/reduced-motion pauses, resize deduplication and resource cleanup.
- `node scripts/check-exam-standards.mjs`.
- `tests/learning/browser.mjs`: five task types, anonymous entry, audio replay, feedback outage/retry, linked attempts, login return, cloud-adapter readback after clearing local IndexedDB, daily two-turn dialogue, refresh, denied microphone, timed stop, draft continuation, duplicate-free retry and responsive layouts. See `browser-results.json` for exact results.

Browser model/ASR/TTS events are controlled fixtures. MediaRecorder captures actual Chromium fake-device streams. Backend handlers, HTTP, cookie authentication, persistence, immutable media and retrieval are exercised; live model quality and real Supabase are not inferred from these tests.

## Remaining validation / limits

1. Real microphone recognition, browser-native voices, physical mobile cameras/GPU and human audio quality require device testing. Browser speech recognition depends on browser/network support; recording-only/typed recovery is explicit.
2. Real model inference requires a configured server-side provider key. Local preview without one returns an honest recoverable error. The engineering fixture server is separate from normal development and is never the user preview.
3. Production Supabase migration/bucket state, deployment aliases and live provider integration were not changed or revalidated here. No claim of a production release.
4. Text-only feedback deliberately provides no pronunciation/intonation/acoustic fluency rating or official exam band. Repetition alignment may reflect ASR mistakes.
5. Complete official-duration mocks, IELTS Part 2 examiner follow-ups, question-bank import management, user-uploaded official banks and long-term validated learning metrics remain future work. The versioned task/attempt structure supports expansion.
6. P3 delivers saved history, retry counts, resume links and concrete next-focus suggestions. It does not invent numerical improvement trends or claim validated learning gains.
