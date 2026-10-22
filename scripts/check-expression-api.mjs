import assert from 'node:assert/strict';
import handler from '../api/expression-review.js';

// No external requests: exercise the actual API/provider plumbing with a fake transport.
process.env.DEEPSEEK_API_KEY = 'test-only';
process.env.EXPRESSION_LLM_PROVIDER = 'deepseek';
let sent;
globalThis.fetch = async (_url, options) => {
  sent = JSON.parse(options.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ notes: [
    { id: '0', question: 'How did that movement accompany your words?', context: 'Agreement', quote: 'Yes, I agree.' },
    { id: '1', question: 'What did you mean?', context: 'Agreement', quote: 'invented quotation' },
  ] }) } }] }) };
};
const clips = ['Yes, I agree.', 'I am not sure.'].map((text, i) => ({ id: String(i), text, context: '',
  brief: { scenarioId: 'office', listener: 'professional', focus: 'clarity', position: 'seated', goal: 'Explain the coverage plan.' },
  personalNote: 'This movement helps me explain.', perceivedEffect: 'supports', coverage: 0.9,
  metrics: { head: 0.14 }, motion: { head: { reversals: 3, coverage: 0.9, range: 0.2 } },
  trajectory: [{ time: 1, head: 0.2 }, { time: 1.25, head: -0.1 }],
  baseline: { sessions: 3, differences: ['head'] },
}));
let status, payload;
const res = { status(code) { status = code; return this; }, json(body) { payload = body; } };
await handler({ method: 'POST', body: { clips } }, res);
assert.equal(status, 200);
const prompt = sent.messages.at(-1).content;
assert(prompt.includes('"head":0.14'));
assert(prompt.includes('"trajectory"'));
assert(prompt.includes('"personalBaseline"'));
assert(prompt.includes('"scenarioId":"office"'));
assert(prompt.includes('Explain the coverage plan.'));
assert(prompt.includes('"selfReportedEffect":"supports"'));
assert.equal(payload.provider, 'deepseek');
assert.equal(payload.model, 'deepseek-chat');
assert.equal(payload.notes[0].suggestedContext, 'Agreement');
assert.equal(payload.notes[1].suggestedContext, 'Unclear', 'Reject a suggestion with invented textual evidence');
await handler({ method: 'POST', body: { clips: [] } }, res);
assert.equal(status, 400);
delete process.env.DEEPSEEK_API_KEY;
await handler({ method: 'POST', body: { clips } }, res);
assert.equal(status, 503);
assert.equal(payload.code, 'not_configured');
await handler({ method: 'GET' }, res);
assert.equal(status, 405);
console.log('PASS: API passes numeric trajectories and baseline, rejects fabricated quote evidence, validates empty input and method. Transport mocked; no external model calls.');
