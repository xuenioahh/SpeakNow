import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-costs-'));
const { requestContext, countModelRequest, countModelUsage, measuredAiTokens } = await import('../../api/_requestContext.js');
const { aggregateUsage, adminUsageReport } = await import('../../api/_usageReport.js');
const { estimateModelCost, priceScenario } = await import('../../shared/usagePricing.js');
const { executeMetered, usageAudit } = await import('../../api/_membership.js');
const provider = { provider: 'deepseek', model: 'deepseek-flash' };
test('conversation calls through speaking-feedback are not attributed to post-session feedback', () => {
  const meteringRuns = [{ at: 100, source: 'provider-reported', outcome: 'success', providerRequests: 1, calls: [{ ...provider, inputTokens: 10, outputTokens: 5 }] }];
  const ledger = { operations: {
    conversation: { endpoint: '/api/speaking-feedback', action: 'conversation_stream', meteringRuns },
    review: { endpoint: '/api/speaking-feedback', meteringRuns },
  } };
  const result = aggregateUsage([{ owner: 'contract-fixture', ledger }], { start: 0, end: 200 });
  assert.equal(result.modules.Conversation?.providerRequests, 1);
  assert.equal(result.modules.Feedback?.providerRequests, 1);
});
test('cumulative SSE usage is counted once and a missing retry receipt stays unknown', () => {
  const req = {};
  requestContext.run(req, () => {
    const callId = countModelRequest(provider);
    for (let i = 0; i < 2; i++) countModelUsage({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 }, { callId, ...provider });
    assert.equal(measuredAiTokens(req), 120);
    countModelRequest(provider);
    assert.equal(measuredAiTokens(req), null);
  });
  assert.equal(req.aiUsage.inputTokens, 100); assert.equal(req.aiUsage.calls.length, 2);
  assert.deepEqual([req.aiUsage.calls[0].cacheHitTokens, req.aiUsage.calls[0].cacheMissTokens], [80, 20]);
});
test('zero tokens are valid, malformed cache splits and missing output are not full receipts', () => {
  const req = {};
  requestContext.run(req, () => {
    countModelRequest(provider); countModelUsage({ prompt_tokens: 0, completion_tokens: 0 });
    assert.equal(measuredAiTokens(req), 0);
    const callId = countModelRequest(provider);
    countModelUsage({ prompt_tokens: 100, prompt_cache_hit_tokens: 200 }, { callId });
    assert.equal(req.aiUsage.calls[1].cacheHitTokens, null); assert.equal(measuredAiTokens(req), null);
  });
});
test('price estimates use cached input rates and retain unknown models as unpriced', () => {
  const cost = estimateModelCost({ ...provider, inputTokens: 1e6, outputTokens: 1e6, cacheHitTokens: 1e6, cacheMissTokens: 0 });
  assert.equal(cost.low, 4.02); assert.equal(cost.high, 8.04);
  assert.equal(estimateModelCost({ ...provider, model: 'unlisted', inputTokens: 1, outputTokens: 1 }), null);
  const unknown = estimateModelCost({ ...provider, inputTokens: 1e6, outputTokens: 0 });
  assert.equal(unknown.low, .02); assert.equal(unknown.high, 2);
});
test('reports exclude fixtures, keep failed costs and do not expose transcripts', () => {
  const measured = { source: 'provider-reported', providerRequests: 1, outcome: 'failed-or-cancelled', calls: [{ ...provider, inputTokens: 100, outputTokens: 20 }], at: 100 };
  const result = aggregateUsage([{ owner: 'private-user', ledger: { operations: { a: { endpoint: '/api/voice-chat', response: { json: { secret: 'private transcript' } }, meteringRuns: [measured, { ...measured, source: 'fixture' }] } } } }], { start: 0, end: 200 });
  assert.equal(result.total.providerRequests, 1); assert.equal(result.total.inputTokens, 100);
  assert.equal(result.total.failedRuns, 1); assert.equal(result.fixturesExcluded, 1);
  assert.ok(!JSON.stringify(result).includes('private-user')); assert.ok(!JSON.stringify(result).includes('private transcript'));
  assert.equal(aggregateUsage([{ owner: 'x', ledger: { operations: { a: { meteringRuns: [measured] } } } }], { start: 101, end: 200 }).total.inputTokens, 0);
});
test('failed logical retries retain every provider call and idempotent replay adds none', async () => {
  const req = { user: { id: 'cost-owner' }, method: 'POST', url: '/api/voice-chat', headers: {}, body: { requestId: 'retry-costs' } };
  const response = () => ({ headersSent: false, status() { return this; }, json() {}, setHeader() {}, end() {} });
  let failed = true;
  const handler = async (_req, res) => {
    const callId = countModelRequest(provider); countModelUsage({ prompt_tokens: 100, completion_tokens: 10 }, { callId, ...provider });
    res.status(failed ? 503 : 200).json({ ok: !failed });
  };
  await executeMetered(req, response(), handler); failed = false;
  await executeMetered(req, response(), handler); await executeMetered(req, response(), handler);
  const ledger = await usageAudit('cost-owner');
  assert.equal(Object.values(ledger.operations)[0].meteringRuns.length, 2);
  const result = aggregateUsage([{ owner: 'cost-owner', ledger }], { start: 0, end: Date.now() + 1 });
  assert.equal(result.total.inputTokens, 200); assert.equal(result.total.providerRequests, 2); assert.equal(result.total.failedRuns, 1);
});
test('administrator-only report and invalid cost assumptions cannot produce a price', async () => {
  await assert.rejects(() => adminUsageReport({ body: {} }), error => error.status === 401);
  await assert.rejects(() => adminUsageReport({ user: { role: 'user' }, body: {} }), error => error.status === 403);
  await assert.rejects(() => adminUsageReport({ user: { role: 'admin' }, body: { days: 91 } }), error => error.status === 400);
  const values = { variableCost: 10, fixedMonthly: 100, payingUsers: 10, freeSubsidy: 20, otherPerUser: 3, reservePercent: 20, paymentFeePercent: 5, marginPercent: 35, packageMinutes: 30, monthlyMinutes: 180 };
  const result = priceScenario(values);
  assert.equal(result.monthlyCost, 30); assert.equal(result.monthlyPrice, 50); assert.ok(Math.abs(result.rechargePrice - 50 / 6) < 1e-10);
  assert.equal(priceScenario({ ...values, payingUsers: 0 }), null); assert.equal(priceScenario({ ...values, fixedMonthly: NaN }), null); assert.equal(priceScenario({ ...values, marginPercent: 95 }), null);
});
test('fixture and unlinked historical sessions cannot dilute the Daily pricing baseline', () => {
  const session = { id: 'session-a', kind: 'daily', amount: 600, startedAt: 100, status: 'completed', used: true };
  const fixture = { owner: 'fixture', ledger: { sessions: { a: session }, operations: { a: { sessionId: 'session-a', meteringRuns: [{ at: 101, source: 'fixture', calls: [], outcome: 'success' }] } } } };
  let report = aggregateUsage([fixture], { start: 0, end: 200 });
  assert.equal(report.daily.sessions, 0); assert.equal(report.daily.seconds, 0);
  report = aggregateUsage([{ owner: 'historical', ledger: { sessions: { a: session } } }], { start: 0, end: 200 });
  assert.equal(report.daily.unlinkedSessions, 1);
});
