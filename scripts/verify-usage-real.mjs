import './load-server-env.mjs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { handler as feedback } from '../api/speaking-feedback.js';
import { requestContext } from '../api/_requestContext.js';
import { aggregateUsage } from '../api/_usageReport.js';

const prior = JSON.parse(await fs.readFile('docs/daily-conversation-2026-11-01/real-model.json', 'utf8'));
const req = { method: 'POST', body: { attempt: { id: randomUUID(), track: 'daily', taskId: 'daily-cafe', title: 'Real usage instrumentation check', context: { scenario: 'cafe', cue: 'menu' }, answers: prior.traces.map((trace, index) => ({ questionIndex: index, turnId: `turn-${index + 1}`, text: trace.userText, prompt: index ? prior.traces[index - 1].reply : 'Welcome to the café.', inputMode: 'text' })), turns: prior.traces.flatMap(trace => [{ role: 'user', content: trace.userText }, { role: 'ai', content: trace.reply }]) } } };
const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; }, setHeader() {} };
const started = Date.now();
await requestContext.run(req, () => feedback(req, res));
const runs = prior.traces.map((trace, index) => ({ at: started + index, source: 'provider-reported', providerRequests: 1, outcome: 'success', calls: [{ provider: 'deepseek', model: trace.model, inputTokens: trace.usage?.prompt_tokens ?? null, outputTokens: trace.usage?.completion_tokens ?? null, cacheHitTokens: trace.usage?.prompt_cache_hit_tokens ?? null, cacheMissTokens: trace.usage?.prompt_cache_miss_tokens ?? null }] }));
const report = aggregateUsage([{ owner: 'isolated-real-model-test', ledger: { operations: { conversation: { endpoint: '/api/voice-chat', meteringRuns: runs }, feedback: { endpoint: '/api/speaking-feedback', meteringRuns: [{ at: Date.now(), source: 'provider-reported', providerRequests: req.aiUsage?.requests || 0, calls: req.aiUsage?.calls || [], outcome: res.code === 200 ? 'success' : 'failed-or-cancelled' }] } } } }], { start: 0, end: Date.now() + 1000 });
const result = { status: res.code === 200 && req.aiUsage?.calls?.some(call => call.reported) ? 'PASS' : 'FAIL', scope: '24 previously recorded real text calls + one new real transcript-feedback request. No mock, no voice provider or human microphone measurement. No production-ledger claim.', feedbackHttp: res.code, feedbackModel: res.value?.model || null, feedbackCalls: req.aiUsage?.calls || [], feedbackWallMs: Date.now() - started, conversationTurns: prior.traces.length, report };
await fs.writeFile('docs/product-refinement-2026-11-03/real-usage.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, feedbackHttp: result.feedbackHttp, feedbackCalls: result.feedbackCalls, totals: report.total }));
if (result.status !== 'PASS') process.exitCode = 1;
