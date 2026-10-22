# SpeakNow Phase 2 — Refinement delivery

Implemented incrementally on the existing React 18.3.1 / Vite 6.4.2 / Three.js 0.171 / Framer Motion 11.18.2 / Recharts 2.15 working tree. No new dependency or business feature. Tasks were executed in order, with build/lint and relevant tests after each task. Native browser/device acceptance remains incomplete.

The working tree already had extensive uncommitted changes. A pre-task source/configuration/status snapshot lives at `/tmp/speaknow-refinement-before`; Task 04/05 intermediate source snapshots are also retained. Reviewable source patches are in `docs/refinement/task04.patch`, `task05.patch`, `task06.patch`; exact per-task paths are in `modified-files.json`. They distinguish these changes from previous user/agent work. No checkout/reset or user-data migration was performed.

## Audit findings

Read all route declarations and primary page structures; global/spatial/scenario/profile/expression styles; token, navigation and modal components; Three.js Orb and environment creation; actual voice controller/capture/API/playback and record flow; feedback, report, history and video practice UI; existing test/build/deployment setup.

Confirmed issues:

- Homepage: five broad blurred ambience elements; separate title hierarchy, narrow entry headings, unbounded account/email strings.
- Scenario cards: pointer-event style writes; selected/transition rules from lazy scene CSS can conflict with global refinements; setup's delayed next-step callbacks are not locked/cancelled.
- Scores: `null`/empty values can be coerced to zero in rendering; missing vectors are plotted like complete vectors; narrow scoring rows use fixed label/meter widths; long SVG labels lack room.
- History: two initial list effects request the same records; loading removes existing rows on refresh; failures can strand a spinner; late responses and deep-link RAF can update an obsolete page; repeated deletes lack a lock.
- Pause feedback: a 300ms interval can launch identical requests while the previous one has not completed; errors lack a reliable loading exit; some playback callbacks update state after unmount.
- Startup: eager imports of histories/scenario/presentation setup pull unused code into a 975KB entry bundle.
- Glow CTA: each pointer event updates React state. LoadingProgressCard uses a timer to claim a synthetic percentage/stage, despite no backend progress information.
- Orb: identical ResizeObserver notifications resize the backing buffer repeatedly; DPR policy is fixed at mount. Scene markers are rewritten every frame even if projection has not changed.
- Mobile: presentation practice always reserves a 224px side column; report score bars have fixed widths; modal content can exceed short viewports; close controls are too small.
- Typecheck: 35 existing errors, predominantly incomplete component/native/ref types and implicit Date arithmetic.

Actual-feature boundary: current code includes conversation corrections, AI reply replay, saved reports/history, video moment replay, four targeted expression drills and A/B recorded-video comparison. A distinct voice-only sentence correction/original-audio/single-sentence retry module was not found. None was fabricated or added; existing video practice is preserved.

## Task 04 — UI Refinement

### Actual modified files

- `src/pages/MainLanding.jsx`
- `src/pages/Home.jsx`
- `src/components/voice/ScenarioCard.jsx`
- `src/components/voice/ModeSelector.jsx`
- `src/spatial-studio.css`

### Changes and source-level visual comparison

- Before: multiple large blur layers. After: one restrained radial ambience surface; existing violet, accent and sage context palette remains.
- Before: brand text and section h1 compete. After: one semantic hero h1, balanced responsive type and a section h2; entry headings have enough width and comfortable line height.
- Before: long identity/title strings can exceed their flex columns. After: controlled wrapping, minimum widths and balanced card spacing.
- Before: every pointer move writes four card style values. After: coalesced to one RAF update; tilt limited to ±2° and cancelled on leave/unmount; image space explicitly reserved.
- Before: rapid mode selection/back can leave delayed step callbacks or complete twice. After: synchronous lock, disabled transition state and cleared timer; same three steps and selection values remain.
- Shared materials refine existing depth tokens; no second visual framework, replacement branding, page or scene.

### Verification

Build and lint passed. All twelve real catalogue cards render with correct labels, selected semantics and image dimensions. Actual selector handler test passed for double-click, pending-transition back/cancellation and single completion. Existing score/report/expression checks passed. At this stage typecheck retained the original 35 diagnostics. Browser launch/server listening failed, so visual comparison here describes implemented source/layout changes, not screenshots.

## Task 05 — Feedback & Reports

### Actual modified files

- `src/lib/reportDisplay.js` (presentation utility)
- `src/components/report/RadarChart.jsx`, `PracticeTimeline.jsx`
- `src/pages/VoiceReport.jsx`, `PresentationReport.jsx`
- `src/pages/VoiceHistory.jsx`, `PresentationHistory.jsx`
- `src/spatial-studio.css`, `src/expression-practice.css`

### Changes

Original and suggested wording are visually separated using the existing supplied text. No AI content or explanation is regenerated. Existing summary, feedback groups, save/retry/replay actions remain. The original/experiment video players keep their URLs, clip boundaries and interaction functions; their typography, touch areas and comparison layout are refined.

Score formatting distinguishes unavailable data from real zero. Missing/infinite/boolean/non-numeric values display “—”; zero and fractions remain unchanged. Incomplete/out-of-range radar vectors do not produce a false polygon; recorded values remain visible. Charts retain the existing scales and dimensions. Task 06 additionally gives SVG labels room according to actual container width.

History uses a shared short English date presentation, explicit unavailable dates, wrapped titles, larger metadata, bounded entrance delays and expanded-state semantics. Request failures are distinguishable from empty histories and can retry the existing read.

### Data integrity

Executed source-level comparisons confirm scoring/normalizing functions remain byte-for-byte identical: VoiceReport normalization and PresentationReport/History clamp/overall/fallback functions. `localReports`, `examStandards`, `localStore` and expression-practice logic are unchanged. Raw-source availability is a display mask; it does not modify the report saved to existing storage. No score rounding, scale, formula or persisted field was added/changed.

Important boundary: if an older normalization path already stored a missing value as numeric zero, UI cannot infer the original absence without changing storage/scoring semantics. This task does not rewrite old records. Existing fallback-generated report values are also not reinterpreted as verified measurements.

### Verification

Build/lint and display/rendering/exam/expression tests passed before Task 06. Tests cover null/empty/invalid versus real zero, exact fractions, immutable source vectors, dates/durations, incomplete/outlier chart display and score/storage source integrity. All original feedback/action logic is retained. Typecheck still had the original 35 diagnostics at this stage. Actual audio/video playback and responsive screenshots remain unverified.

## Task 06 — Performance & Mobile

### Actual modified files

- `src/App.jsx`, `index.html`, `src/index.css`, `src/spatial-studio.css`
- `src/components/GlowCTAButton.jsx`, `LoadingProgressCard.jsx`, `src/components/voice/ScenarioCard.jsx`
- `src/lib/latestResource.js`, `src/hooks/useSessionHistory.js`
- `src/pages/VoiceHistory.jsx`, `PresentationHistory.jsx`, `PresentationFeedback.jsx`
- `src/components/spatial/VoiceOrb.jsx`, `src/components/scene/createScene.js`
- `src/components/report/RadarChart.jsx`, `src/components/ui/dialog.jsx`
- `src/pages/PresentationPractice.jsx`, `PresentationAnalysis.jsx`, `AdminPage.jsx`
- `src/components/presentation/LiveScorePanel.jsx` (clarifying label only)
- `src/pages/CasualVideo.jsx`, `src/api/localClient.js`, `src/types/globals.d.ts` (types only)
- `src/lib/profileAnalytics.js` (equivalent explicit Date timestamp comparison)

### Performance/stability repairs

Heavy existing pages now load on demand; route paths/auth remain unchanged. Route transitions keep opacity without transforming the ancestor of fixed navigation. Both history pages use one serialized/coalesced existing read and ignore obsolete/unmounted responses; background refresh keeps current rows visible. Deep links do not re-open a user-collapsed record on every refresh; deferred scroll is cancelled. Existing deletion has a duplicate-click lock and failure feedback.

Pause feedback polls the same source at the same interval, but only changed payloads start a serialized request; duplicate in-flight reads are coalesced and stale completion cannot overwrite the current page. Errors preserve data and provide recovery. Playback callbacks are guarded on unmount and against completion of an older interrupted playback. The API/model payload is unchanged.

Glow follows CSS variables instead of pointer-driven React state. Loading remains functional but no longer claims a timed percentage or invented completed stages; it waits for the caller's actual result.

Orb geometry, materials, shaders, real-energy consumer and state behavior remain. Only resize/DPR handling changed: backing buffer changes require new dimensions/DPR; current viewport selects existing desktop/mobile caps. Existing hidden/offscreen/reduced-motion/error pause and full disposal are retained; teardown also releases the WebGL context. Scene projection writes only changed marker values; mobile antialias/DPR/shadow-map budgets are lower while camera, objects, cues and motion remain.

Font families/weights/swap are unchanged; font CSS discovery/preconnect is moved to the document head instead of CSS @import. Existing scenario photos also offer 200/400px source candidates with sizes matching the current grid; no new image/3D asset or dependency.

### Mobile/accessibility repairs

CSS supports the six requested widths: 320, 375, 390, 768, 1024 and 1440px. They are test targets, not asserted real-browser passes.

Presentation practice changes to a stacked, scrollable small-screen layout instead of a fixed 224px sidebar squeezing the document. Prev/next have accessible names and touch sizes. Report rows/meters, SVG labels, history titles and admin panels fit intrinsic widths; modal width/height are viewport-bounded with a 44px close target. Existing focus traps and reduced-motion preference remain. Input minimum sizes and the viewport's keyboard resizing hint improve available space without a new mobile workflow. Keyboard behavior still needs physical-device testing.

Type fixes do not change capture logic or API behavior. Source AST equality verifies annotation-only CasualVideo/localClient edits. Explicit `.getTime()` replaces equivalent Date subtraction; full analytics-output comparison passed. All 35 previous type diagnostics are resolved without relaxing compiler settings.

### Measured before/after

Measured from actual production artifacts. Gzip sums compress each bundled asset independently; excludes external fonts/images, public vision worker/models, network/cache, parse/paint and runtime memory/FPS.

| Metric | Before | After |
| --- | ---: | ---: |
| Entry static JS raw bytes | 975,090 | 513,444 |
| Entry static JS gzip bytes | 288,058 | 164,521 |
| All bundled asset JS raw bytes | 1,743,536 | 1,753,221 |
| All bundled asset JS gzip bytes | 502,824 | 516,540 |
| Bundled JS file count | 22 | 49 |

Entry raw bytes decrease 47.34%; entry gzip decreases 42.89%. Total gzip increases 13,716 bytes (about 2.7%) because code splitting and supporting code reduce compression sharing. **Total payload did not decrease.** No measured FCP/LCP/FPS/memory improvement is claimed.

Controlled execution of the actual components additionally measured:

| Setter invocation benchmark | Before | After |
| --- | ---: | ---: |
| Glow, 100 pointer events | 100 | 0 |
| Loading, mount + 100 timer ticks | 101 | 0 |

These are fixture-driven invocation counts, not actual React paint counts or FPS. Raw records live in `docs/refinement/bundle-before.json`, `bundle-after.json`, `state-updates.json`.

## Final Regression

### Executed and passed

- `npm run build`
- `npm run lint`
- `npm run typecheck` — original 35 errors → 0; configuration not weakened
- `node scripts/check-refinement-ui.mjs`
- `node scripts/check-report-display.mjs`
- `node scripts/check-refinement-lifecycle.mjs`
- `node scripts/check-orb-lifecycle.mjs` — actual component with controlled renderer; not a GPU shader/visual test
- `node scripts/check-refinement-scope.mjs`
- `node scripts/check-voice-recording.mjs` — includes actual controller five-round/cancel/timeout/caption and resource checks, actual React controls and cancellation-to-fetch checks
- `node scripts/check-spatial-audio.mjs`
- `node scripts/check-exam-standards.mjs`
- `node scripts/check-expression-context.mjs`
- `node scripts/check-expression-practice.mjs`
- `node scripts/check-spatial-render.mjs`
- `node scripts/check-refinement-performance.mjs`
- `node scripts/measure-refinement-build.mjs`
- All seven existing application stylesheets parsed with PostCSS
- Browser-suite syntax check

### Browser/environment result

Attempted Task 04 and final browser execution. Vite listening at `127.0.0.1:5173` is rejected with EPERM. Installed Chrome exits with SIGABRT; process control reports EPERM. No actual page screenshot, width assertion, GPU draw, microphone recording, OS TTS, original-media playback or mobile-keyboard check ran. Browser tests are **not passed**.

`check-refinement-browser.cjs` uses actual local application/account data and no mocks/invented records. With real authenticated storageState it covers homepage, all 12 scenarios, existing mode modal, presentation entry, profile, histories and expression page at all six widths. It does not fabricate report/practice contexts or save/delete records. Missing authentication/practice contexts are explicitly skipped, not called passing tests.

Run outside the managed environment:

```sh
npm run dev
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SPEAKNOW_STORAGE_STATE=/path/to/actual-auth-state.json node scripts/check-refinement-browser.cjs
# For an installed Playwright WebKit, unset CHROME_PATH:
SPEAKNOW_BROWSER=webkit SPEAKNOW_STORAGE_STATE=/path/to/actual-auth-state.json node scripts/check-refinement-browser.cjs
```

### Required manual verification (not performed)

At 320/375/390/768/1024/1440px inspect all actual routes, including authenticated/admin branches and real report/presentation contexts. Verify focus, modal close/return, long titles, source scores and actual axis labels. Complete at least five real microphone/AI turns, deny/recover permission, interrupt playback, leave during recording/request/playback and use browser Back. Replay actual recorded video moments and compare the real original/second take; complete an existing targeted drill. Upload an actual presentation and verify stacked mobile layout, slide controls, pause feedback, original save/report/history flow and virtual keyboard. Inspect actual GPU frame time/memory and confirm resource release with browser tools.

### Unresolved boundaries

1. A distinct voice-only Task 03 original-audio/sentence retry implementation was not found. Existing video replay, targeted practice/A-B comparison and supplied textual corrections are preserved. Missing functionality is not replaced with a mock or newly built module.
2. Existing LiveScorePanel uses Math.random to drift values, not measured speech/body-language scoring. Its generator/callback/protocol is unchanged; it is now explicitly marked Demo indicators. It **cannot** satisfy real-score accuracy acceptance. Replacing it would require changing the prohibited scoring/data pipeline.
3. Existing PresentationReport fallback uses static scores. Its function and saved payload remain unchanged per scope. Those estimates cannot be asserted as real API-measured performance; fixing their generation/storage needs a separately authorized scoring change.
4. Older persisted zero-versus-missing ambiguity cannot be reconstructed safely without data/scoring changes. No record rewriting was attempted.
5. Transport for existing record/pause reads has no abort option. This task serializes and isolates completion; it does not claim provider/server work is cancelled after unmount.
6. Physical audio, Safari/mobile, screenshots, all viewport assertions and runtime frame/memory measurements remain unverified. The existing approximately 1.8MB profile hero image remains unchanged; no image-load/LCP improvement is claimed.

## Scope Verification

- Added business features/pages/routes/scenes/roles/settings/search/filter/sort: **No**.
- Added dependencies: **No**, package.json and lockfile unchanged.
- Changed API endpoints/payloads/database schemas/fields/tables/user records: **No**. localClient changed only by a type annotation, confirmed by AST equality.
- Changed prompts/models/scoring/normalization: **No**. Score-generating/normalizing functions and helpers are protected by source checks; analytics timestamp comparison has equivalent full output.
- Changed microphone/ASR/TTS/dialogue protocol: **No**. Existing core controller, capture, energy and audioManager files are byte-identical to task-start. Orb shaders are identical.
- Rebuilt Orb/added 3D content/deleted functionality: **No**. Existing visual elements and actions remain; synthetic loading percentages were corrected to truthful pending state.
- Introduced mock user data: **No**. Unit fixtures are isolated tests; the browser suite uses real data and writes no user records. Pre-existing simulated score producers are disclosed above rather than falsely called real measurements.
- Unfinished/unverified items: **Yes**, the runtime checks and producer/source limitations above. This is not a declaration that every commercial-quality acceptance criterion has passed.
