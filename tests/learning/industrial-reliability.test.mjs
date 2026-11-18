import test from 'node:test';
import assert from 'node:assert/strict';
import { apiJson } from '../../src/api/http.js';
import { streamConversationReply } from '../../api/_llm.js';
import { startVisionSession } from '../../src/lib/expressionVisionSession.js';

test('HTTP 200 with an invalid JSON body cannot masquerade as a saved practice', async () => {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => new Response('<html>Proxy error</html>', { status: 200 });
  try {
    await assert.rejects(apiJson('/api/speaking-practice', { action: 'save' }), error => error.code === 'invalid_api_response');
  } finally { globalThis.fetch = previousFetch; globalThis.document = previousDocument; }
});

test('an already-cancelled conversation never starts a paid provider request', async () => {
  const previousFetch = globalThis.fetch, previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'engineering-fixture-not-a-key';
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response('data: {"choices":[{"delta":{"content":"Fixture only"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  };
  const controller = new AbortController(); controller.abort();
  try {
    await assert.rejects(streamConversationReply({ systemText: 'Fixture', userText: 'Fixture', signal: controller.signal }), error => error.name === 'AbortError');
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test('JSON requests time out while awaiting headers or body, and preserve caller cancellation', async () => {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  globalThis.document = { cookie: '' };
  const pending = signal => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    globalThis.fetch = async (_url, options) => pending(options.signal);
    await assert.rejects(apiJson('/api/membership', {}, { timeoutMs: 10 }), error => error.code === 'request_timeout');
    globalThis.fetch = async (_url, options) => ({ ok: true, status: 200, json: () => pending(options.signal) });
    await assert.rejects(apiJson('/api/speaking-practice', {}, { timeoutMs: 10 }), error => error.code === 'request_timeout');
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async () => assert.fail('No fetch after cancellation');
    await assert.rejects(apiJson('/api/membership', {}, { signal: controller.signal }), error => error.name === 'AbortError');
  } finally { globalThis.fetch = previousFetch; globalThis.document = previousDocument; }
});

test('a JSON rate-limit response retains its actionable status and error code', async () => {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => Response.json({ error: 'Retry later', code: 'request_rate_limited' }, { status: 429 });
  try { await assert.rejects(apiJson('/api/membership', {}), error => error.status === 429 && error.code === 'request_rate_limited'); }
  finally { globalThis.fetch = previousFetch; globalThis.document = previousDocument; }
});

test('loaded visual models with repeated inference failures cannot claim active analysis', () => {
  const names = ['Worker', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'];
  const originals = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  let worker, stopped = false;
  const statuses = [];
  try {
    globalThis.Worker = class { constructor() { worker = this; } postMessage() {} terminate() { stopped = true; } };
    globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};
    globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
    startVisionSession({ readyState: 2 }, { onSample() {}, onStatus: status => statuses.push(status) });
    worker.onmessage({ data: { type: 'ready', models: { face: true, pose: true, hands: true } } });
    for (let index = 0; index < 3; index++) worker.onmessage({ data: { type: 'sample', inference: { face: false, pose: false, hands: false } } });
    assert.equal(statuses.at(-1), 'unavailable');
    assert.equal(stopped, true);
  } finally { Object.assign(globalThis, originals); }
});

test('visual readiness waits for inference; partial detection is explicit and empty frames remain valid', () => {
  const names = ['Worker', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'];
  const originals = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  let worker;
  const statuses = [], samples = [];
  try {
    globalThis.Worker = class { constructor() { worker = this; } postMessage() {} terminate() {} };
    globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};
    globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
    const stop = startVisionSession({ readyState: 2 }, { onSample: sample => samples.push(sample), onStatus: status => statuses.push(status) });
    worker.onmessage({ data: { type: 'ready', models: { face: true, pose: true, hands: true } } });
    assert.equal(statuses.at(-1), 'loading');
    worker.onmessage({ data: { type: 'sample', inference: { face: true, pose: false, hands: false }, facePresent: false } });
    assert.equal(statuses.at(-1), 'partial'); assert.equal(samples[0].facePresent, false);
    worker.onmessage({ data: { type: 'sample', inference: { face: true, pose: true, hands: true }, facePresent: false, bodyPresent: false } });
    assert.equal(statuses.at(-1), 'ready'); assert.equal(samples.length, 2);
    stop();
  } finally { Object.assign(globalThis, originals); }
});
