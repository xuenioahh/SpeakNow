# Context-led expression review and API audit

Checked locally on 2026-09-18. This is a development change; no deployment or provider-account change was performed.

## What changed in the learner experience

1. Choose a situation, listener category, one practice focus, seated/standing setup and a listener-facing goal before recording. Existing scenario tasks can prefill the brief, which the learner can change.
2. Freeze the brief with the recording and preserve it across A/B takes. Preparing another situation does not relabel old recordings or erase a review before new camera access succeeds.
3. Describe visible movement and show frame coverage. Per-clip “Why this observation?” explains the measurement and the comparison source.
4. Compare only earlier confirmed examples matching scene, listener category, focus, recording position and user-confirmed meaning. Legacy examples without a brief remain stored, but do not enter the new context-specific baseline. Current-session and rejected examples remain excluded.
5. The learner optionally labels movement as helpful, interfering or uncertain. This is their impression, passed to reflection as self-report; it is not a model-assigned behavior score. Changing evidence invalidates the saved confirmation and previous model question.
6. Goal-focused prompts, personal baselines and the learner’s interpretation accompany numeric trajectories sent for optional AI reflection. No raw video is sent. Provider/model provenance is returned after successful generation.
7. All 12 scenario choices remain. A procedural Three.js room offers drag/rotate exploration, with a scenario brief and separate conversation/video actions. It renders only when changed or resized, has a no-WebGL fallback, and respects reduced motion for card tilt. It is a stylized spatial preview, not a fully simulated environment.
8. A collaboration window provides teaching, research and technical collaboration directions and downloads a planning brief. It does not submit applications or claim an existing partnership. A separate server-side compatible-provider slot is also reserved.

## Research basis versus engineering choices

- [Marques et al., Behaviour Change Technique Ontology (2023)](https://discovery.ucl.ac.uk/id/eprint/10176196/) provides a vocabulary for intervention components such as goals, monitoring and rehearsal. We use those concepts to structure intention → observation → reflection → another take. This is a design application, not evidence that SpeakNow improves speaking outcomes.
- [Nonverbal Social Sensing (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8353184/) distinguishes extracting behavior from inferring meaning and describes contextual limits. The implementation measures landmark proxies and asks the speaker to confirm meaning. It does not infer emotion, attention, personality or truthfulness.
- [Schmalenbach et al. (2017)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01828/full) studied associations between self-reported gesture use and multisensory processing. This motivates attention to individual variation; it does not validate our camera measurements, grouping choices or comparison thresholds.

The three-session minimum, 4 Hz sampling, visibility/coverage cutoffs, noise floors and robust-deviation thresholds are engineering choices. They are not validated psychological scales or confidence levels. Goal text is preserved and used in reflection, but different free-text goals within the same categorical group are **not** proven equivalent. Camera angle/distance, lighting, language, culture and disability can still change measurements. No new personalized vision model has been trained; personalization currently changes comparison scope and reflection context.

## Actual API connection

```text
Camera frames → local MediaPipe Worker → numeric movement summaries
Browser speech recognition → words with approximate timing
Learner's brief + corrected words + numeric trajectories + matched baseline
  → POST /api/expression-review
  → api/_llm.js
  → selected provider's /chat/completions
  → validated quote/context + reflection question + provider/model
```

The active shared adapter uses Chat Completions with JSON output. Old unused Responses/OpenRouter-specific helper functions were removed to make the real connection unambiguous. The JSON schema is now included in the prompt; provider JSON mode is not the same as enforced strict schema validation. The expression endpoint filters response fields, bounds text and verifies quoted substrings.

| Provider | Server configuration | Endpoint |
| --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL` | `https://api.deepseek.com/chat/completions` |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_BASE_URL` | default `https://api.openai.com/v1/chat/completions` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_VOICE_CHAT_MODEL` | `https://openrouter.ai/api/v1/chat/completions` |
| Zhipu | `ZHIPU_API_KEY`, `ZHIPU_MODEL` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| LongCat | `LONGCAT_API_KEY`, `LONGCAT_MODEL` | `https://api.longcat.chat/openai/v1/chat/completions` |
| Future partner | `PARTNER_API_KEY`, `PARTNER_BASE_URL`, `PARTNER_MODEL` | configured server base URL + `/chat/completions` |

`LLM_PROVIDER` selects a provider globally. `EXPRESSION_LLM_PROVIDER`, when non-empty, overrides it for expression questions. `auto` retains the previous priority order (OpenAI → OpenRouter → DeepSeek → Zhipu → LongCat), with the new partner slot last. An explicit provider never falls back to a different billing account. Expression requests use one attempt per configured provider and an 18-second overall request budget, within the frontend's 20-second timeout.

To use the existing DeepSeek account for this feature, configure the actual server environment:

```dotenv
EXPRESSION_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<server-side key from the funded DeepSeek account>
DEEPSEEK_MODEL=deepseek-chat
```

No key should be put into `VITE_*` variables or a browser form. Configuration presence is not proof of a valid key, balance or model access. `GET /api/expression-service` returns only configured provider/model names and `connection: not_tested`; actual successful requests report which provider responded.

## What was actually verified about your account

- This project's local `.env` contains the frontend admin-email setting, but no LLM key. The current process also has no configured LLM key.
- Local live backend check: `GET /api/expression-service` returned 200 with `available: false`; a synthetic reflection request returned 503 with `code: not_configured`. No paid model call was made.
- The project is linked to Vercel project `omniverse-ent208`, but the local Vercel CLI has no credentials. Read-only environment inspection stopped at “No existing credentials found”. Therefore production provider configuration, historic DeepSeek usage and current DeepSeek balance are **unverified**, not assumed absent.
- `node scripts/inspect-expression-api.mjs --balance` inspects only local configuration and, when a DeepSeek key exists, can query the official [DeepSeek balance endpoint](https://api-docs.deepseek.com/api/get-user-balance/). In this session the balance lookup was skipped because no local DeepSeek key exists.

## Can this use a ChatGPT account allowance?

General OpenAI API calls use an OpenAI Platform API key and Platform billing. ChatGPT subscription access and Codex access tokens are different authentication paths. The [official authentication documentation](https://learn.chatgpt.com/docs/auth#sign-in-with-an-api-key) states that API-key use follows standard API pricing rather than included ChatGPT-plan credits, and general API calls continue to use Platform API keys. A ChatGPT subscription or locally signed-in Codex session therefore cannot simply replace this website's provider API key. If “GPT balance” means an actual funded OpenAI Platform project, its server-side key can use the OpenAI slot, subject to model permissions and balance.

## Verification

The context and provider routing tests use synthetic data and mocked HTTP transport. Browser checks use real Chrome/MediaRecorder with simulated devices and movement measurements; they do not validate real landmark accuracy or actual paid-provider availability. See the test scripts and `EXPRESSION_UX_REVIEW.md` for the earlier usability review.

Latest local validation: five analysis/context/API/practice/routing scripts, lint and production build passed. The main browser suite passed 14 task checks, and the scene suite passed three additional checks for narrow screens, reduced motion/keyboard use and unavailable WebGL. Real paid-provider and real camera accuracy checks remain outstanding.
