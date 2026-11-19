import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requestStructuredLlm } from '../../api/_llm.js';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-stability-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5218';
const { startVipTrial, requestVip, adminMembership } = await import('../../api/_membershipActions.js');
const { membershipSnapshot } = await import('../../api/_membership.js');
const { mutateLedger } = await import('../../api/_membershipStore.js');
const { effectivePlan } = await import('../../api/_plans.js');
const { saveUser, listAccountSummaries } = await import('../../api/_appStore.js');
const member = () => ({ user: { id: randomUUID(), role: 'user' }, body: {} });
const result = value => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 3, completion_tokens: 5 } }) });
async function mockedProvider(run) {
  const before = { fetch: globalThis.fetch, key: process.env.DEEPSEEK_API_KEY };
  process.env.DEEPSEEK_API_KEY = 'engineering-fixture';
  try { await run(); } finally { globalThis.fetch = before.fetch; if (before.key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = before.key; }
}
const input = { provider: 'deepseek', systemText: 'Return a test object', userText: 'Fixture', timeoutMs: 1000, totalTimeoutMs: 3000, retryOnce: true };
test('transient service errors and dropped connections retry once within the same billing provider', async () => mockedProvider(async () => {
  let calls = 0;
  globalThis.fetch = async url => { assert.match(String(url), /^https:\/\/api\.deepseek\.com\//); if (++calls === 1) return { ok: false, status: 503 }; return result({ ready: true }); };
  assert.equal((await requestStructuredLlm(input)).parsed.ready, true); assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('network disconnected'); return result({ ready: true }); };
  assert.equal((await requestStructuredLlm(input)).parsed.ready, true); assert.equal(calls, 2);
}));
test('malformed feedback is retried, permanent credential failures are not retried', async () => mockedProvider(async () => {
  let calls = 0;
  globalThis.fetch = async () => result(++calls === 1 ? { invented: true } : { ready: true });
  assert.equal((await requestStructuredLlm({ ...input, validateResult: value => assert.equal(value.ready, true) })).parsed.ready, true);
  assert.equal(calls, 2); calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 401 }; };
  await assert.rejects(() => requestStructuredLlm(input), error => error.code === 'provider_key_invalid'); assert.equal(calls, 1);
}));
test('one VIP trial per signed-in account is atomic and expires back to Free', async () => {
  await assert.rejects(() => startVipTrial({ body: {} }), error => error.status === 401);
  const request = member();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => startVipTrial(request)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const status = await membershipSnapshot(request);
  assert.equal(status.effectivePlan, 'vip'); assert.equal(status.trialAvailable, false);
  assert.equal(status.membership.origin, 'trial'); assert.ok(status.plans.vip.monthlyLimits.daily > 300);
  assert.equal(effectivePlan(status.membership, Date.parse(status.membership.expiresAt) + 1), 'free');
  await mutateLedger(request.user.id, ledger => { ledger.entitlement.currentPeriodEnd = '2020-01-01T00:00:00.000Z'; ledger.entitlement.expiresAt = '2020-01-01T00:00:00.000Z'; });
  assert.equal((await membershipSnapshot(request)).effectivePlan, 'free');
  await assert.rejects(() => startVipTrial(request), error => error.status === 409);
});
test('VIP requests are idempotent and only an administrator can grant, decline or revoke access', async () => {
  const request = member(); await saveUser({ id: request.user.id, email: `${randomUUID()}@example.invalid`, role: 'user' }, { insert: true });
  const summary = (await listAccountSummaries()).find(user => user.id === request.user.id);
  assert.ok(summary); assert.equal(summary.password, undefined);
  request.body.note = 'More IELTS practice';
  const first = await requestVip(request), second = await requestVip(request); assert.equal(first.id, second.id);
  await assert.rejects(() => adminMembership({ ...request, body: { action: 'admin-grant', userId: request.user.id, days: 30 } }), error => error.status === 403);
  const admin = { user: { id: 'administrator-fixture', role: 'admin' }, body: { action: 'admin-grant', userId: request.user.id, days: 30 } };
  await adminMembership(admin); assert.equal((await membershipSnapshot(request)).effectivePlan, 'vip');
  assert.equal((await membershipSnapshot(request)).upgradeRequest.status, 'approved');
  await adminMembership({ ...admin, body: { ...admin.body, action: 'admin-revoke' } });
  assert.equal((await membershipSnapshot(request)).effectivePlan, 'free');
  assert.equal((await membershipSnapshot(request)).trialAvailable, false);
  await assert.rejects(() => adminMembership({ ...admin, body: { ...admin.body, days: 999 } }), error => error.status === 400);
});

test('Pro applications use deck prices and approvals grant the selected duration once', async () => {
  for (const [days, price] of [[30,30],[90,78],[360,298]]) {
    const req = member();
    await saveUser({ id:req.user.id, email:req.user.id+'@example.invalid', role:'user' });
    const application = await requestVip({ ...req, body:{termDays:days, priceCny:1} });
    assert.equal(application.priceCny, price);
    const admin = {user:{id:'admin',role:'admin'},body:{action:'admin-grant',userId:req.user.id,days,requestId:application.id}};
    await assert.rejects(() => adminMembership({...admin,body:{...admin.body, days:7}}), e => e.status === 409);
    await adminMembership(admin);
    const status = await membershipSnapshot(req);
    assert.equal(Date.parse(status.membership.currentPeriodEnd) - Date.parse(status.membership.currentPeriodStart), days * 86400000);
    await assert.rejects(() => adminMembership(admin), e => e.status === 409);
  }
  await assert.rejects(() => requestVip({...member(),body:{termDays:365}}), e => e.status === 400);
});
