# Core flow audit before implementation

| Current route / component | Actual behavior | Change |
|---|---|---|
| `/` MainLanding | Slogan, small cards, repeated links and bottom navigation compete | Two large clickable direction cards; history/account remain quiet navigation |
| `/exam` ExamSpeaking | Five hardcoded sample tasks; quick practice opens question zero | Two TOEFL task cards linking to separate banks; preserve legacy task links for existing records |
| No bank route or catalogue | Only one sample repeat set and one sample interview set | Import real sources; stable set/question IDs; separate data from attempts |
| `/exam/practice?task=…` ExamPractice | Intro and exercise share route; numeric index only | Separate preparation route; preserve set/question/scope/session; retain legacy links |
| AudioTake / VoiceCapture | Real MediaRecorder, raw and confirmed transcripts, checkpoint storage | Reuse; verify recovery and per-question association |
| `/practice/review?id=…` LearningReview | Evidence-based transcript coaching, linked same-task retry | Add bank navigation, question/set retry, post-answer reference access |
| LearningHistory / IndexedDB / cloud API | Immutable attempts and task snapshots; drafts keyed by task/scope | Preserve old records; add stable question/set metadata and completed scope |
| `/voice` Home | Preselected café preview, selection scrolls back to top | Put real scenarios first; select one clear next action; retain real conversation flow |

Before screenshots: `before-home.png`, `before-types.png`, `before-daily.png`.

Found input files: Repeat PDF under `../语言/`, two identical text companions in Downloads, and the requested final Interview DOCX under `../语言/`. The second named PDF was not found. Raw extracts, hashes, locators, counts and anomalies are retained under `shared/question-bank/`. No user recordings are used as source material.

PDFKit extracted a few separately positioned text endings out of order. Rendered PDF pages 7, 9, 12 and 13 were checked against the supplied text; a split numbered line is parsed correctly, and three hash-bound extraction exceptions use the verified text companion. Interview groups with fewer or more than four questions are kept as supplied.

Format reference: [ETS 2026 Speaking overview](https://www.de.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-test-overview.pdf). The app uses browser-generated speech and transcript coaching, not original ETS recordings or official scoring.
