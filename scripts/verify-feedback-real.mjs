import './load-server-env.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { handler } from '../api/speaking-feedback.js';
import { requestContext } from '../api/_requestContext.js';
import { getSpeakingTask } from '../shared/speakingTasks.js';
process.env.LLM_PROVIDER = 'deepseek';
const repeat = getSpeakingTask('toefl-repeat-campus-v1');
const samples = [
  { name: 'IELTS single answer', body: { action: 'practice-answer', attempt: { id: 'real-feedback-ielts', track: 'exam', taskId: 'ielts-part1-study-v1', practiceMode: 'quick', answers: [{ questionIndex: 0, text: 'I study computer science. I choose it because I like solve problems. Last week I built a small app that helps my sister plan her homework.' }] } } },
  { name: 'TOEFL seven-sentence group', body: { attempt: { id: 'real-feedback-repeat', track: 'exam', taskId: repeat.id, practiceMode: 'set', answers: repeat.prompts.map((prompt, questionIndex) => ({ questionIndex, text: questionIndex < 3 ? prompt.split(' ').slice(1).join(' ') : prompt })) } } },
  { name: 'Daily actual reply in context', body: { attempt: { id: 'real-feedback-daily', track: 'daily', taskId: 'daily-cafe', context: { scenario: 'cafe' }, answers: [{ questionIndex: 0, prompt: 'What do you like to drink?', text: 'I usually drink mint tea because coffee keeps me awake. Last Friday I meet my friend Maya here, and we talked about our train trip.' }], turns: [{ role: 'ai', content: 'What do you like to drink?' }, { role: 'user', content: 'I usually drink mint tea because coffee keeps me awake. Last Friday I meet my friend Maya here, and we talked about our train trip.' }] } } },
];
const report = { scope: 'Real DeepSeek API, explicit engineering text inputs, no audio/device inference, no database writes or mock provider.', results: [] };
try {
  assert.ok(process.env.DEEPSEEK_API_KEY, 'DEEPSEEK_API_KEY missing');
  for (const sample of samples) {
    const req = { method: 'POST', body: sample.body }, res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    const start = performance.now(); await requestContext.run(req, () => handler(req, res));
    report.results.push({ name: sample.name, status: res.code, elapsedMs: Math.round(performance.now() - start), usage: req.aiUsage, feedback: res.value });
    assert.equal(res.code, 200); assert.equal(res.value.provider, 'deepseek');
    assert.ok(req.aiUsage?.usageReported); assert.ok(res.value.summary);
    for (const improvement of res.value.improvements) assert.ok(sample.body.attempt.answers[improvement.answerIndex].text.includes(improvement.quote));
    console.log(`${sample.name}: real response, ${req.aiUsage.inputTokens} input / ${req.aiUsage.outputTokens} output tokens`);
  }
  report.status = 'PASS: API and exact-quote checks; wording retained for human review';
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1; }
await fs.mkdir('docs/feedback-2026-11-13', { recursive: true });
await fs.writeFile('docs/feedback-2026-11-13/real-model.json', JSON.stringify(report, null, 2));
console.log(report.status);
