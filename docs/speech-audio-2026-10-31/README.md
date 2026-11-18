# IELTS recording checks and pronunciation assessment · 2026-10-31

Implemented in the local `speaknow-audit` working copy. No production deployment or paid speech resource was created.

## Available now

IELTS bank and mock recordings receive checks based on decoded audio samples: duration, average and peak level, clipped samples, quiet time and internal pauses of at least 0.5 seconds. Results appear after recording and on the review page, and are retained locally. Silent, very quiet, clipped and very short recordings get concrete retry advice. Quiet intervals are amplitude estimates; background sound can be mistaken for activity. These checks do not diagnose background noise or establish pronunciation quality.

An IELTS recording can now be completed without browser transcription. Text feedback still requires an actual transcript; audio analysis does not invent one.

## Speech service integration

The server uses Microsoft Speech SDK 1.53.0 in continuous, unscripted pronunciation assessment mode. It submits the full decoded recording as 16 kHz mono PCM, including Part 2 answers up to 120 seconds; the assessment transport accepts up to 130 seconds. No model receives a typed answer as a substitute for the recording.

When configured, review automatically assesses recorded answers and displays pronunciation accuracy, acoustic fluency, available prosody scores, recognized speech duration, and word-level observations linked to the recording timestamps. Multi-utterance indicators are duration-weighted averages of provider scores, explicitly labelled as practice indicators rather than IELTS bands. Unsupported scores remain unavailable. A failed request retains recordings and text feedback and provides a retry. Successful results survive refresh; account results are retained in the owned practice record. Locally generated results are retained on the device until the speech service has assessed and saved them for the account.

The adapter uses server-only credentials:

```dotenv
AZURE_SPEECH_KEY=your-speech-resource-key
AZURE_SPEECH_REGION=your-resource-region
```

Add these to the existing `.env.local` and restart the backend (`npm run dev` for the normal development launcher). For hosted deployment, set both variables in the hosting environment. Existing DeepSeek credentials are preserved. Do not use `VITE_` variables for these credentials. The endpoint supports same-origin guest practice and authenticated practice with the existing session/CSRF checks, bounded WAV input, ownership checks, separate speech request budgets, and explicit service errors. The server checks audio duration from the PCM bytes, not caller metadata. WAV audio is not stored as an additional cloud object; existing recordings retain their normal storage lifecycle.

At implementation time no Azure Speech credential was configured. Recording checks work without it. The UI therefore identifies pronunciation assessment as awaiting setup, without generating placeholder numeric results. Live speech recognition, billing and provider measurement quality have not been verified.

## Verification

- `npm test`: 147 passing tests, including silent/quiet/clipped samples, internal pauses, malformed/oversized WAV input, absent keys, missing provider scores, audio-only IELTS practice, continuous two-minute PCM submission with late utterances, provider cancellation, origin/session checks, ownership and persisted results.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `node tests/learning/speech-audio-browser.mjs`: four browser checks passed. Chrome used an actual MediaRecorder and audio decoder with a generated microphone fixture. Browser speech recognition, text-model responses and pronunciation responses were controlled engineering fixtures; screenshots containing scores are not live-provider evidence.
- The installed official SDK's construction, unscripted configuration and cleanup were also exercised without starting a network request.
- Browser checks cover practice/review quality checks, simultaneous text feedback, controlled speech outage and retry, timestamp replay, saved-result refresh, a 390px viewport and completing IELTS practice without transcription.

Results: `browser-results.json`, `tests.log` and screenshots in this folder. No credentials are included.

Implementation references: [Microsoft pronunciation assessment documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment), [Microsoft continuous JavaScript example](https://github.com/Azure-Samples/cognitive-services-speech-sdk/blob/master/scenarios/javascript/node/language-learning/pronunciationAssessmentContinue.js). Continuous mode is used because [short-audio REST pronunciation assessment is limited to 30 seconds](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short).
