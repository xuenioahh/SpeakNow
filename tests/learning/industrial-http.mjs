import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateAttempt } from '../../shared/speakingTasks.js';
const origin = 'http://127.0.0.1:5240';
const output = 'docs/industrial-audit-2026-11-10/http-security-load.json';
const results = [];
const headers = { 'Content-Type': 'application/json', Origin: origin };
async function check(name, route, options, expected) {
  const response = await fetch(origin + route, { ...options, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, expected, name);
  results.push({ name, status: response.status });
  return response;
}
const response = await check('fixture provider canary', '/api/speaking-feedback', { method: 'POST', headers, body: JSON.stringify({ action: 'conversation_stream', scenario: { id: 'cafe' }, userText: 'Engineering fixture canary only.' }) }, 200);
assert.match(await response.text(), /Engineering fixture/);
await check('anonymous practice access denied', '/api/speaking-practice', { method: 'POST', headers, body: '{"action":"list"}' }, 401);
await check('cross-origin inference denied', '/api/speaking-feedback', { method: 'POST', headers: { ...headers, Origin: 'https://hostile.example.invalid' }, body: '{}' }, 403);
await check('malformed JSON rejected', '/api/speaking-feedback', { method: 'POST', headers, body: '{' }, 400);
await check('private helper is not routable', '/api/_auth', {}, 404);
await check('oversized JSON rejected', '/api/speaking-feedback', { method: 'POST', headers, body: JSON.stringify({ input: 'x'.repeat(530000) }) }, 413);
const longAttempt = validateAttempt({ id: randomUUID(), track: 'daily', createdAt: new Date().toISOString(), answers: Array.from({ length: 80 }, (_, questionIndex) => ({ questionIndex, text: 'Synthetic long-session evidence. '.repeat(12), rawTranscript: 'Synthetic long-session evidence. '.repeat(12), prompt: 'Describe your next travel plan.', inputMode: 'text' })) });
const longBody = JSON.stringify({ attempt: longAttempt });
await check('known gap: valid long-session review rejected before model context compaction', '/api/speaking-feedback', { method: 'POST', headers, body: longBody }, 413);
const began = performance.now();
const requests = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
  const started = performance.now();
  const result = await fetch(`${origin}/api/speaking-feedback`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ action: 'conversation_stream', requestId: randomUUID(), scenario: { id: 'cafe' }, userText: `Controlled concurrent request ${index}.` }),
  });
  const body = await result.text();
  return { index, status: result.status, completed: body.includes('event: done'), fixture: body.includes('Engineering fixture'), elapsedMs: Math.round(performance.now() - started) };
}));
const elapsedMs = Math.round(performance.now() - began);
const report = { category: 'Mock HTTP integration + local concurrency, not real provider load', knownGap: { issue: 'SN-008', answers: longAttempt.answers.length, payloadBytes: Buffer.byteLength(longBody), status: 413 }, results, requests, elapsedMs, successCount: requests.filter(item => item.status === 200 && item.completed && item.fixture).length, scope: 'Twelve concurrent local HTTP/SSE calls, actual authentication/rate/membership JSON storage paths. No cloud DB or external API capacity claim.' };
await fs.writeFile(output, JSON.stringify(report, null, 2));
assert.equal(report.successCount, 12);
console.log(JSON.stringify({ securityChecks: results.length - 2, knownGap: report.knownGap, concurrentRequests: 12, successCount: report.successCount, elapsedMs }));
