# Casual Situation: personal expression preview

Purpose: help a speaker review their own words and movements, and recognize their own recurring patterns. No gesture is assigned an intent or correctness score.

## The Expression Lab: intentional practice

The core learning experience is now an experiment with the learner's own words. They select a recorded moment, choose one skill (clarity, structure, emphasis, or expression), write a listener-facing intention, and record a second take. Each drill has three concrete steps, a listening question and a transfer prompt for a different conversation.

An independent Blob URL preserves the original recording while the normal recorder creates the second take. The learner explicitly selects the matching second moment, replays A/B, confirms the same idea is being compared, and chooses the original, the new approach, or uncertainty. Saving requires a specific reflection. These are self-reported preferences; word counts, approximate clip duration and observed movements are descriptive, not improvement scores.

The practice playbook stores up to 60 account-scoped local reflections, including intention, transcript comparison, preference and transfer prompt. It stores no videos or Blob URLs. Records can be revised in the active experiment or deleted from the playbook. The original video URL is revoked when the experiment closes or the page unmounts. No model key is required for the authored drills, recording comparison or reflection flow.

Positioning: the learner rehearses a real idea, tests one deliberate change, and keeps a reusable discovery. This is a practice workflow, not a validated claim of improved speaking proficiency. Listener comprehension and real-world transfer still need user evaluation.

## Implemented flow

1. `/voice` → Casual Situation → `/voice/casual-video`.
2. Explicit camera/microphone permission; maximum two-minute video recording. Video is an in-memory Blob, downloadable by the user, never uploaded.
3. MediaPipe face and pose models run in a Web Worker, sampled at 4 Hz. Version-pinned runtime and model files are fetched from jsDelivr/Google. Failure leaves recording and review available.
4. Observe horizontal/vertical nose position relative to the eyes, iris position, shoulder tilt and wrist distances/heights. Direction reversals above a noise threshold produce tentative repeated-motion descriptors. Gaps reset direction tracking. These remain proxies, not calibrated gaze or reliable nod/shake classifiers.
5. Browser speech recognition produces approximate utterance boundaries. Review clips prefer those boundaries (3–12 seconds); eight-second fallback windows cover remaining time. Repeated movement and personal deviations are ranked first; all clips remain accessible. Low coverage cannot be confirmed as training evidence.
6. The speaker confirms context, adds a personal interpretation, and confirms or rejects examples. Up to 240 compact examples are retained per account in this browser. Three independent earlier sessions are needed per context and measurement. Session medians prevent one long recording dominating; median absolute deviation compares variation and direction-change rate. Rejected/current-session evidence is excluded. Version 1 examples are preserved but not mixed with version 2.
7. Optional semantic reflection sends words, numeric time-aligned trajectories, motion descriptors and personal-baseline counts for up to 12 clips to `/api/expression-review`. Context suggestions must quote actual words and need user confirmation. Editing evidence invalidates previous confirmation; stale responses cannot overwrite edited text/context. Raw video is never sent, trajectories are not stored in the notebook.
8. The notebook displays recurring movement by user-confirmed context, with counts of independent sessions. This is an adaptive statistical profile, not a fine-tuned personalized vision model.

## Review usability

The session overview shows recording duration, review-moment count, moments with sufficient visual evidence, and confirmed examples. These are descriptive counts, not performance scores. Filters separate all, pending, confirmed and excluded moments while preserving priority order. Empty filters explain how to continue. Replay buttons seek to the selected moment and pause at its end; pausing or seeking before the range exits clip playback. Limited-evidence moments explain why habit confirmation is disabled while keeping transcript review and practice available.

A task-based browser review on 2026-09-18 added focus/scroll handoff after recording, return-to-moment navigation, inline second-take transcript editing with same-idea reconfirmation, local model-error feedback, and preservation of the previous review when a new camera request fails. See `EXPRESSION_UX_REVIEW.md` for findings, reproducible browser checks and limitations.

## Context and scenario upgrade

Recordings now require a listener-facing goal and a situation brief. Personal baselines additionally match scene, listener category, focus and seated/standing position; pre-brief examples remain stored but are not mixed. Research/threshold explanations, self-reported movement impact, 12 interactive spatial previews and a collaboration brief window are implemented. See `EXPRESSION_CONTEXT_AND_API.md` for research sources, actual model routing, configuration and audit limitations.

## Next milestones

- Evaluate landmark quality and alignment against consented, manually annotated recordings, including glasses, varied lighting, camera positioning, accents and assistive communication.
- Replace approximate browser transcription with audio timestamps when a transcription service is configured; keep user corrections.
- Calibrate actual head angles and gesture classifiers against annotated recordings. Current normalized trajectories and reversal counts are tentative descriptors.
- Add retrieval of similar verified clips; current personalized comparison uses compact statistics.
- Persist user-owned notebook data through authenticated database access; local storage is explicitly device-local, not cloud sync.
- Evaluate ranking and noise thresholds on real recordings. Synthetic trajectory tests establish behavior, not real-world accuracy.

## Deployment

Build with `npm run build`. Existing Vercel project link is used; deploy a preview first. The route requires sign-in. The recording page works without a model key; optional context questions require a configured supported provider. HTTPS is required outside localhost. No changes to Presentation video behavior.

Validation: `node scripts/check-expression-practice.mjs`, `node scripts/check-expression.mjs`, `node scripts/check-expression-api.mjs`, lint and build. Browser checks use synthetic recordings for original-video preservation, A/B comparison, required reflection, local persistence/deletion and mobile layout. They do not validate educational effectiveness or visual detection accuracy.
