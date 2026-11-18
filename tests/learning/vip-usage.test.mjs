import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_PAYWALL_ENABLED = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-vip-'));
const plans = await import('../../api/_plans.js');
const reports = await import('../../api/_usageReport.js');
const { mutateLedger } = await import('../../api/_membershipStore.js');
const { reservePractice, membershipSnapshot } = await import('../../api/_membership.js');
const { requestVip, adminMembership } = await import('../../api/_membershipActions.js');
const { saveUser } = await import('../../api/_appStore.js');
const { readLedger } = await import('../../api/_membershipStore.js');
const { tokenPackageEstimate } = await import('../../shared/usagePricing.js');
const now = Date.now();
const entitlement = { planType: 'vip', subscriptionStatus: 'active', currentPeriodStart: new Date(now - 1000).toISOString(), currentPeriodEnd: '2099-01-01T00:00:00.000Z', origin: 'local-testing', unlimitedTesting: true };
const request = { user: { id: 'local-test-only', role: 'learner' }, socket: { remoteAddress: '127.0.0.1' }, body: {} };
test('unlimited testing is server-provisioned, loopback-only and never valid in production', () => {
  assert.equal(plans.localUnlimitedTesting(request, entitlement), true);
  assert.equal(plans.localUnlimitedTesting({ ...request, socket: { remoteAddress: '203.0.113.1' } }, entitlement), false);
  assert.equal(plans.localUnlimitedTesting(request, { ...entitlement, origin: 'trial' }), false);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.equal(plans.localUnlimitedTesting(request, entitlement), false); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('local test allowance does not exhaust and is explicit in membership status', async () => {
  await mutateLedger(request.user.id, ledger => {
    ledger.entitlement = entitlement;
    ledger.sessions.old = { period: plans.billingPeriod().key, kind: 'daily', amount: 999999, status: 'completed' };
  });
  const session = await reservePractice(request, { id: 'local-test-session', kind: 'daily' });
  assert.equal(session.unlimitedTesting, true);
  const snapshot = await membershipSnapshot(request);
  assert.equal(snapshot.unlimitedTesting, true);
  assert.equal(snapshot.remainingQuota.daily, null);
  assert.equal(snapshot.paymentsEnabled, false);
});
test('personal usage reads only the signed-in ledger, excludes fixtures and never returns content', async () => {
  const run = { at: Date.now(), source: 'provider-reported', outcome: 'success', providerRequests: 1, calls: [{ provider: 'deepseek', model: 'deepseek-flash', inputTokens: 100, outputTokens: 20, cacheHitTokens: 80, cacheMissTokens: 20 }] };
  await mutateLedger(request.user.id, ledger => { ledger.operations.mine = { response: { text: 'private transcript' }, meteringRuns: [run, { ...run, source: 'fixture' }] }; });
  await mutateLedger('someone-else', ledger => { ledger.operations.other = { meteringRuns: [run] }; });
  const report = await reports.accountUsageReport({ ...request, body: { userId: 'someone-else' } });
  assert.equal(report.total.inputTokens, 100);
  assert.equal(report.total.reportedCalls, 1);
  assert.equal(report.fixturesExcluded, 1);
  assert.equal(report.billingConfirmed, false);
  assert.ok(!JSON.stringify(report).includes('private transcript'));
  assert.equal(report.users, undefined);
  await assert.rejects(() => reports.accountUsageReport({ body: {} }), error => error.status === 401);
});
test('recharge requests remain pending without payment and renewal preserves active days', async () => {
  const userId = 'renewal-fixture';
  await saveUser({ id: userId, email: 'renewal@example.invalid', role: 'learner' }, { insert: true });
  const expiry = Date.now() + 30 * 86400000;
  await mutateLedger(userId, ledger => { ledger.entitlement = { ...entitlement, unlimitedTesting: false, origin: 'administrator', expiresAt: new Date(expiry).toISOString(), currentPeriodEnd: new Date(expiry).toISOString() }; });
  const req = { user: { id: userId, role: 'learner' }, body: { requestType: 'renewal' } };
  const first = await requestVip(req), duplicate = await requestVip(req);
  assert.equal(first.id, duplicate.id); assert.equal(first.status, 'pending'); assert.equal(first.paymentStatus, 'not-requested');
  await assert.rejects(() => adminMembership({ ...req, body: { action: 'admin-grant', userId, days: 7 } }), error => error.status === 403);
  await adminMembership({ user: { id: 'fixture-admin', role: 'admin' }, body: { action: 'admin-grant', userId, days: 7 } });
  const ledger = await readLedger(userId);
  assert.equal(Date.parse(ledger.entitlement.expiresAt), expiry + 7 * 86400000);
  assert.equal(ledger.upgradeRequest.status, 'approved');
  assert.equal(ledger.upgradeRequest.paymentStatus, 'not-requested');
});
test('token package projection requires complete priced receipts and is not a retail price', () => {
  const totals = { inputTokens: 800, outputTokens: 200, estimatedCnyLow: .001, estimatedCnyHigh: .002, reportedCalls: 2, missingUsageCalls: 0, unpricedCalls: 0 };
  assert.equal(tokenPackageEstimate(totals, 1000000).high, 2);
  assert.equal(tokenPackageEstimate({ ...totals, missingUsageCalls: 1 }, 1000000), null);
  assert.equal(tokenPackageEstimate({ ...totals, unpricedCalls: 1 }, 1000000), null);
  assert.equal(tokenPackageEstimate(totals, 0), null);
});
test('renewal also preserves days from the pre-ledger membership store', async () => {
  const { provisionMembership } = await import('../../api/_membershipStore.js');
  const userId = 'legacy-renewal-fixture', expiry = Date.now() + 10 * 86400000;
  await saveUser({ id: userId, email: 'legacy-renewal@example.invalid', role: 'learner' }, { insert: true });
  await provisionMembership(userId, { ...entitlement, origin: 'administrator', unlimitedTesting: false, currentPeriodEnd: new Date(expiry).toISOString(), expiresAt: new Date(expiry).toISOString() });
  await adminMembership({ user: { id: 'fixture-admin', role: 'admin' }, body: { action: 'admin-grant', userId, days: 7 } });
  assert.equal(Date.parse((await readLedger(userId)).entitlement.expiresAt), expiry + 7 * 86400000);
});
test('local unlimited skips personal daily caps but cannot bypass global spend protection', async () => {
  const { issueSession } = await import('../../api/_auth.js');
  const { protectedApi } = await import('../../api/_apiGuard.js');
  await saveUser({ id: request.user.id, email: 'guard-fixture@example.invalid', role: 'learner' }, { insert: true });
  const headers = {};
  await issueSession(request.user, { setHeader: (key, value) => { headers[key] = value; } });
  const cookies = headers['Set-Cookie'].map(value => value.split(';')[0]);
  const cookieMap = Object.fromEntries(cookies.map(value => value.split('=')));
  const req = { ...request, method: 'POST', url: '/api/speaking-feedback', headers: { cookie: cookies.join('; '), 'x-csrf-token': cookieMap.speaknow_csrf }, body: { requestId: 'guard-personal-cap' } };
  const response = () => ({ headersSent: false, code: 200, status(code) { this.code = code; return this; }, setHeader() {}, json(value) { this.value = value; } });
  const keys = ['SPEAKNOW_AI_DAILY_REQUESTS', 'SPEAKNOW_AI_DAILY_TOKEN_BUDGET', 'SPEAKNOW_AI_GLOBAL_REQUESTS'];
  const before = keys.map(key => process.env[key]);
  try {
    process.env.SPEAKNOW_AI_DAILY_REQUESTS = '0'; process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET = '0'; process.env.SPEAKNOW_AI_GLOBAL_REQUESTS = '2000';
    const handler = protectedApi(async (_req, res) => res.json({ fixture: true }), { ai: true });
    const success = response(); await handler(req, success); assert.equal(success.code, 200); assert.equal(success.value.fixture, true);
    process.env.SPEAKNOW_AI_GLOBAL_REQUESTS = '0';
    const denied = response(); await handler({ ...req, body: { requestId: 'guard-global-cap' } }, denied);
    assert.equal(denied.code, 429); assert.match(denied.value.error, /Service analysis budget/);
  } finally { keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; }); }
});
