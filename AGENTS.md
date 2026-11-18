# SpeakNow working baseline

This directory is the consolidated local version. Preserve its IELTS banks, shared recording analysis, feedback recovery, VIP lifecycle, exam/practice modes and light design when restoring older UI features.

Accepted interaction requirements are recorded in `docs/ui-restoration-2026-10-31/accepted-ui-2026-10-29.md` and `docs/comprehensive-2026-10-29/requirements.txt`:

- Mount one fixed application navigation. History and insights share My Progress; account settings remain separate.
- Daily conversation keeps the scene mounted and places a scrollable transcript beside it on desktop and below it on mobile. Preserve reading position, follow new replies, support replay, and provide an explicit jump to the latest message.
- An NPC opening is part of the conversation. Play it before capturing the learner; prevent simultaneous NPC audio and microphone capture. Retain retry, cancellation, drafts and recordings.
- Keep optional camera settings and detailed observations away from primary speaking controls. Feedback prioritises a personal summary, supported improvements and retry; detailed recordings and metrics use disclosure.
- Preserve the light theme through lazy routes, dialogs and scene lighting changes. Verify 320px and 390px screens and short viewports.
- TOEFL repetition never reveals its sentence automatically during answering. Preserve separate practice and exam behaviour.
- Use actual audio for acoustic claims. Never substitute transcript inference or synthetic scores for pronunciation measurement.
- Do not invent payments, prices, usage, performance improvements or service success rates. Report the number and scope of actual checks and any missing service credentials.

Before finishing, compare against these behaviours, run meaningful relevant tests, and identify the project directory serving the normal preview. Do not replace this directory with another working copy wholesale.
