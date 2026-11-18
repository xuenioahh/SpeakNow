import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-rate-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5198';
process.env.SPEAKNOW_PAYWALL_ENABLED = 'false';
delete process.env.SPEAKNOW_TRIAL_MINUTE_REQUESTS;
const { trialApi } = await import('../../api/_trialGuard.js');
const endpoint = trialApi(async (_request, response) => response.json({ reply: 'Delivered reply' }));
async function request(ip) {
  const req = { method: 'POST', url: '/api/speaking-feedback', body: { requestId: randomUUID() }, socket: { remoteAddress: ip }, headers: { host: 'localhost:5198', origin: process.env.SPEAKNOW_ORIGIN, 'content-type': 'application/json' } };
  const response = { code: 200, headers: {}, headersSent: false, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.value = value; this.headersSent = true; } };
  await endpoint(req, response);
  return response;
}
test('a normal burst can finish conversation and feedback; excess gets a temporary rate reason and cooldown', async () => {
  process.env.SPEAKNOW_TRIAL_DAILY_REQUESTS = '100';
  for (let i = 0; i < 20; i++) assert.equal((await request('203.0.113.20')).code, 200);
  const blocked = await request('203.0.113.20');
  assert.equal(blocked.code, 429);
  assert.equal(blocked.value.code, 'request_rate_limited');
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(blocked.value.retryAfterSeconds, 60);
});
test('guest daily exhaustion is distinct from a temporary provider or minute failure', async () => {
  process.env.SPEAKNOW_TRIAL_DAILY_REQUESTS = '2';
  assert.equal((await request('203.0.113.21')).code, 200);
  assert.equal((await request('203.0.113.21')).code, 200);
  const blocked = await request('203.0.113.21');
  assert.equal(blocked.code, 429);
  assert.equal(blocked.value.code, 'guest_allowance_exhausted');
  assert.match(blocked.value.error, /Sign in/);
  assert.equal(blocked.headers['Retry-After'], undefined);
});
