# SpeakNow Task 01 — Voice Orb and speaking room

Implemented against the existing working tree. This task changes only the speaking page, its orb/input adapter, relevant types, tests and this record. Previous work on other pages is preserved, not extended or reverted. No dependency, backend service, API, route, entity schema, score calculation or saved user record was changed.

## Inspection and reuse

Installed versions: React 18.3.1, React Router 6.30.3, Vite 6.4.2, Three.js 0.171.0 and Framer Motion 11.18.2. Build is `vite build`. Reused VoiceChat, RecordingControls, ChatMessage, the existing lazy SceneStage, SpeechRecognition, audioManager's browser SpeechSynthesis playback callbacks, localApi, scenario/session data, brand tokens and reduced-motion behavior. No React Three Fiber/Drei installation was needed.

Read the existing rendering, routing, global/spatial CSS, microphone permission/transcription, speech playback, state, session persistence, tests and global type definitions. A task-start snapshot is in `/tmp/speaknow-task01-before`. Installed versions are reported here rather than assuming package ranges are exact versions.

## Actual changed files

| File | Purpose |
| --- | --- |
| `src/components/spatial/VoiceOrb.jsx` | Improve deformed-surface light, Fresnel, interior glow, bounded fluid deformation, flow changes and quiet error state |
| `src/pages/VoiceChat.jsx` | Adapt real state; completion on practice end; show metering availability; load page-scoped style |
| `src/components/voice/RecordingControls.jsx` | Share input track; retain stream through recognition restart; native fallback without parallel metering; preserve transcript and cleanup |
| `src/lib/audioEnergy.js` | Time-based RMS smoothing; failed-initialization cleanup; existing-stream analysis only |
| `src/lib/voiceOrbState.js` | New frontend state adapter and conservative audio-track capability policy |
| `src/voice-room.css` | New styles scoped exclusively to `.speaking-room` |
| `src/types/globals.d.ts` | Recognition start-event and optional input-track types |
| `scripts/check-spatial-audio.mjs` | Extend energy, state, timing and compatibility fixtures |
| `scripts/check-voice-recording.mjs` | New runtime handler/lifecycle test using the actual recording component |
| `scripts/check-voice-orb-browser.cjs` | New Task 01 WebGL/interaction suite, currently blocked before execution |
| `docs/VOICE_ORB_TASK01.md` | Scope, implementation, test results and outstanding acceptance |

Home, MainLanding, reports, Profile, history pages, App, global/spatial CSS, localClient, localReports, localStore and audioManager compare byte-for-byte equal to the task-start snapshot. No automatic work on tasks 2 or 3.

## State mapping

| Existing signal | Visual state | Behavior |
| --- | --- | --- |
| No active input/request/playback | Idle | Quiet breathing, slight flotation and slow internal bands |
| Recording active and native recognition `onstart` acknowledged | Listening | Real microphone RMS drives the existing GPU energy uniform when the input track can be shared |
| Existing `isAiThinking` after submission | Processing | Ordered low-frequency flow and soft violet shift |
| Existing audioManager utterance `onstart`/`onend` callbacks | Speaking | Truthful playback indicator; no fabricated output amplitude |
| Existing End Practice action | Completed | One soft expansion/highlight during the existing route exit; does not delay navigation |
| Existing input error or failed/fallback conversation request | Error | Amber indication; freeze continuous WebGL flotation/flow |

Response arrival no longer claims Completed. It returns to Idle. The adapter changes only presentation state and does not introduce backend statuses.

## Audio source and compatibility

`audioEnergy` never calls getUserMedia. It attaches an AnalyserNode to the existing permission/capture stream owned by RecordingControls. RMS is bounded 0–1, with 50ms attack and 140ms release; the orb adds a small 80ms spring-like interpolation. Surface deformation is bounded to ±6.2% of the base radius and stays inside the glass shell. No random audio envelope is used.

To avoid the previous separate SpeechRecognition microphone plus retained meter stream, compatible desktop Chromium receives the *same* track via `recognition.start(track)`. Recognition restarts reuse both capture and meter. No second getUserMedia acquisition is made for animation.

The `audioTrack` overload is experimental and not universally supported. The conservative policy enables known desktop Chrome/Chromium >=135; excludes Android, iOS and unknown engines. On Safari/mobile/older engines, the existing permission-check stream is released before calling the original native `start()` without a track. Transcription and typed input remain; RMS deformation is unavailable instead of opening another mic. If a compatible engine explicitly rejects track input with TypeError/NotSupportedError, it releases the shared capture and switches to native recognition without a meter for that session.

Sources: [MDN start(audioTrack)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start), [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json). Browser identity gating is conservative and is not a physical-browser verification.

AI playback still uses the existing SpeechSynthesis manager, which does not expose an audio stream in this project. The orb responds to actual playback events but receives no synthesized amplitude. This intentionally does not invent output synchronization or add an AI/audio service.

## Visual difference from the task-start code

The previous orb lit the undeformed original sphere and approximated its edge from normal.z. This version computes the actual deformed surface normal, view-angle Fresnel reflection, soft directional/fill illumination and a restrained interior glow. Fluid speed blends between states; breathing remains slow. Error rendering settles once and stops its continuous RAF loop.

The existing central orb / side conversation / bottom control layout is retained. Header, conversation and input surfaces now use different opacity, reflection and shadow depths; text stays upright. Controls lift gently on hover and press inward on click. A one-shot completion ring belongs to ending practice, not every coach reply. Styles are loaded with VoiceChat and scoped to its root; no global design changes were made in this task.

## Performance and resources

Retain existing lazy VoiceOrb and environment loading, desktop DPR 1.5/mobile 1.25, reduced mobile sphere complexity, approximately 30fps mobile cap, offscreen/hidden/blur pause and reduced-motion static state renders. No particles, postprocessing or extra canvas was added. Shader compilation failure and WebGL context loss fall back to the existing styled 2D orb. Canvas remains pointer-transparent.

Stop/exit/unmount disposes the analyser/context and owner capture, clears recognition callbacks, silence/restart timers and pending permission ownership. Late permission streams are stopped. Orb teardown releases frames, resize/intersection observers, document/window listeners, geometries, materials and renderer. Existing recording, send, retry, replay, scene exploration and report-navigation order remains.

## Executed verification

- `npm run build`: passed; separate VoiceOrb and VoiceChat chunks emitted.
- `npm run lint`: passed.
- `npm run typecheck`: fails with the same 36 diagnostics as task-start; no new diagnostics in task files. Existing unrelated type problems remain.
- `node scripts/check-spatial-audio.mjs`: passed. RMS/silence/limits, 30fps/60fps timing consistency, disposal/failed initialization, UI state adapter, shared-track policy and actual speech-event fixture lifecycle.
- `node scripts/check-voice-recording.mjs`: passed. Runs actual component handlers through deterministic React hook dispatch: same-track sharing, a single acquisition across restart, native fallback with no concurrent meter stream, rejected experimental overload, denied permission, explicit stop/unmount and late-permission release. This is not a real DOM/browser test.
- Existing exam-standard, expression-context, expression-practice and React report/timeline rendering checks: passed. Existing report/storage/API source files are unchanged.
- `node --check scripts/check-voice-orb-browser.cjs`: passed.

### Not verified in a browser

Tried Vite listening at `127.0.0.1:5173`: blocked by managed environment with `EPERM`. Tried the browser suite using installed Chrome and available Playwright: Chrome exits with `SIGABRT`; process control also reports `EPERM`. No browser assertions ran, and no screenshot/real-microphone/mobile/Safari pass is claimed.

| Requested acceptance | Current evidence |
| --- | --- |
| Practice page can enter | Build passed; browser entry unverified |
| 3D sphere renders | Shader/Three component implemented; real GPU render unverified |
| Idle/Listening switch | State/actual-handler fixtures passed; browser unverified |
| Actual voice changes the sphere | Same-track RMS-to-uniform implemented; physical mic/GPU unverified |
| Silence smoothly releases | Executed energy/math test passed; visible browser result unverified |
| AI speaks only on real playback | Executed SpeechSynthesis event-fixture test passed; OS TTS unverified |
| Playback end exits Speaking | Event-fixture test passed; OS TTS unverified |
| Denied mic does not crash | Actual handler fixture passed; browser prompt unverified |
| Page exit releases audio/frames | Handler disposal passed; real RAF/GPU teardown unverified |
| Mobile recording button usable | Responsive CSS and 44px targets implemented; mobile browser unverified |
| AI, feedback/history preserved | Unchanged APIs/storage/report/history source + regression checks; end-to-end backend unverified |
| Build successful | Passed |

The browser suite includes real WebGL uniform observation driven by an oscillator test stream, silence release, no reacquisition, processing/idle semantics, playback truthfulness, permission errors, 390px/320px controls, reduced-motion/error freeze, exit cleanup and WebGL fallback. It uses API fixtures and does not replace physical microphone/SpeechRecognition/OS speech testing.

Run where browser/server execution is permitted:

```sh
npm run dev
# Other terminal, with Playwright installed or PLAYWRIGHT_MODULE supplied:
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-voice-orb-browser.cjs
# WebKit when its Playwright executable is installed; unset CHROME_PATH:
SPEAKNOW_BROWSER=webkit node scripts/check-voice-orb-browser.cjs
```

Outstanding: real desktop/Safari/mobile visual and audio acceptance; RMS visualization on engines that do not accept the same input track; AI output-energy analysis unavailable from the existing TTS pipeline; 36 unrelated pre-existing type diagnostics. No task 2/3 work is included.
