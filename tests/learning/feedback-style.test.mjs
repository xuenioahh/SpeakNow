import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { feedbackScope, FEEDBACK_STYLE } from '../../shared/feedbackStyle.js';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-answer-feedback-'));
process.env.LLM_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'engineering-fixture-not-a-key';
const { handler } = await import('../../api/speaking-feedback.js');
const { executeMetered, usageAudit } = await import('../../api/_membership.js');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, setHeader() {}, json(value) { this.value = value; } });
const attempt = { id: 'answer-feedback-fixture', track: 'exam', taskId: 'sample-toefl-repeat', practiceMode: 'quick', answers: [{ questionIndex: 0, text: 'Please bring the folder tomorrow.' }] };
test('single-answer and group coaching have different evidence scopes', () => {
  assert.match(feedbackScope({ answers: [{}] }), /SINGLE ANSWER/);
  assert.match(feedbackScope({ answers: Array(7).fill({}) }), /GROUP REVIEW of 7/);
  assert.match(FEEDBACK_STYLE, /Never imply you heard audio/);
});
test('signed-in immediate feedback needs no saved attempt and applies tutor standards', async () => {
  const original = globalThis.fetch;
  let prompt;
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: 'You kept the request direct. Check the target wording before another take.', strengths: [], improvements: [] }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
  };
  try {
    const req = { user: { id: 'feedback-owner' }, method: 'POST', url: '/api/speaking-feedback', headers: {}, body: { action: 'practice-answer', requestId: 'take-one', attempt } };
    const res = response();
    await executeMetered(req, res, handler);
    assert.equal(res.code, 200); assert.equal(res.value.source, 'ai');
    assert.match(prompt.messages[0].content, /thoughtful speaking tutor/);
    assert.match(prompt.messages[1].content, /SINGLE ANSWER/);
    assert.deepEqual(JSON.parse(prompt.messages[1].content).repetitionGroup.differentQuestionNumbers, [1]);
    const ledger = await usageAudit(req.user.id);
    assert.equal(Object.values(ledger.operations)[0].response, null);
    const stored = await fs.readFile(path.join(process.env.SPEAKNOW_DATA_DIR, 'security-db.json'), 'utf8');
    assert.ok(!stored.includes('You kept the request direct'));
  } finally { globalThis.fetch = original; }
});
test('unsaved normal feedback still requires ownership and one-answer route rejects groups', async () => {
  const normal = response();
  await handler({ user: { id: 'feedback-owner' }, method: 'POST', body: { attempt } }, normal);
  assert.equal(normal.code, 409);
  const group = response();
  await handler({ method: 'POST', body: { action: 'practice-answer', attempt: { ...attempt, practiceMode: 'set' } } }, group);
  assert.equal(group.code, 400);
});
