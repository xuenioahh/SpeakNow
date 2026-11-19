// Real isolated MongoDB process, no mocks and no connection to an Atlas account.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { getMongoDb, closeMongo, mongoRequest, checkMongoHealth } from '../../api/_mongoStore.js';
import { storageProvider } from '../../api/_storageProvider.js';
import { getUserById, getUserByEmail, saveUser, saveOwned, getOwned, listOwned, deleteOwned, updateImpact, appStorageMode, updateUserFields } from '../../api/_appStore.js';
import { consumeLimit, releaseLimit, recordUsage } from '../../api/_securityStore.js';
import { issueSession, authenticate, clearSession } from '../../api/_auth.js';
import { mutateLedger, readLedger, readLedgerPage, provisionMembership, readMembership } from '../../api/_membershipStore.js';
import { mediaObject } from '../../api/_mediaStore.js';
import { appendAdminEvent, listAdminData } from '../../api/_adminStore.js';
import { checkStorageHealth } from '../../api/_storageHealth.js';
import { handler as practiceHandler } from '../../api/speaking-practice.js';

let server;
const database = `speaknow_test_${randomUUID().replaceAll('-', '')}`;
before(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.0.17' }, instance: { ip: '127.0.0.1' } });
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = database;
  process.env.SPEAKNOW_STORAGE_PROVIDER = 'mongodb';
  process.env.FORCE_LOCAL_DATA = 'false';
  // Stale Supabase variables must never win over explicit MongoDB selection.
  process.env.SUPABASE_URL = 'https://unused.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unused-fixture';
  await getMongoDb();
});
after(async () => {
  await closeMongo();
  await server?.stop();
});

test('explicit MongoDB selection, missing configuration and production fail closed', async () => {
  assert.equal(storageProvider(), 'mongodb');
  assert.equal(appStorageMode(), 'mongodb');
  assert.equal(storageProvider({ MONGODB_URI: 'mongodb://localhost', SUPABASE_URL: 'old', SUPABASE_SERVICE_ROLE_KEY: 'old' }), 'mongodb');
  assert.equal(storageProvider({ FORCE_LOCAL_DATA: 'true', SPEAKNOW_STORAGE_PROVIDER: 'mongodb' }), 'server-local');
  assert.throws(() => storageProvider({ VERCEL: '1' }), error => error.status === 503);
  assert.throws(() => storageProvider({ SPEAKNOW_STORAGE_PROVIDER: 'typo' }), error => error.status === 503);
  assert.equal((await checkStorageHealth({ env: { SPEAKNOW_STORAGE_PROVIDER: 'mongodb' } })).ok, false);
});

test('unique email survives concurrent registrations; profiles persist across reconnect', async () => {
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => saveUser({ id: `registration-${i}`, email: 'unique@example.invalid', role: 'learner', full_name: 'Test' }, { insert: true })));
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.ok(outcomes.filter(row => row.status === 'rejected').every(row => row.reason.status === 409));
  const user = await getUserByEmail('unique@example.invalid');
  await updateUserFields(user.id, { full_name: 'Updated', profile_preferences: { weekly_goal: 5 } });
  await closeMongo();
  assert.equal((await getUserById(user.id)).full_name, 'Updated');
  assert.equal((await getUserById(user.id)).profile_preferences.weekly_goal, 5);
});

test('signed-in sessions enforce CSRF and revocation using MongoDB', async () => {
  const user = await getUserByEmail('unique@example.invalid');
  let cookies;
  const res = { setHeader(name, value) { if (name === 'Set-Cookie') cookies = value; } };
  await issueSession(user, res);
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  const csrf = cookies.find(value => value.startsWith('speaknow_csrf=')).split(';')[0].split('=')[1];
  const req = { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } };
  assert.equal((await authenticate(req)).id, user.id);
  await assert.rejects(() => authenticate({ ...req, headers: { cookie } }), error => error.status === 403);
  await clearSession(req, res);
  await assert.rejects(() => authenticate(req), error => error.status === 401);
});

test('practice reads, updates and deletes are isolated by owner', async () => {
  await saveOwned('voiceSessions', 'owner-a', { id: 'private-practice', created_date: new Date().toISOString(), messages: [{ text: 'private' }] });
  assert.equal(await getOwned('voiceSessions', 'owner-b', 'private-practice'), null);
  assert.deepEqual(await listOwned('voiceSessions', 'owner-b'), []);
  await assert.rejects(() => saveOwned('voiceSessions', 'owner-b', { id: 'private-practice', messages: [] }, { update: true }), error => error.status === 404);
  await assert.rejects(() => deleteOwned('voiceSessions', 'owner-b', 'private-practice'), error => error.status === 404);
  assert.equal((await getOwned('voiceSessions', 'owner-a', 'private-practice')).messages[0].text, 'private');
});

test('rate limits are atomic under 60 concurrent requests, release and expiry', async () => {
  const results = await Promise.all(Array.from({ length: 60 }, () => consumeLimit('parallel-budget', 17, 60000)));
  assert.equal(results.filter(Boolean).length, 17);
  await releaseLimit('parallel-budget', 5);
  const again = await Promise.all(Array.from({ length: 12 }, () => consumeLimit('parallel-budget', 17, 60000)));
  assert.equal(again.filter(Boolean).length, 5);
  await releaseLimit('parallel-budget', 999);
  assert.equal(await consumeLimit('parallel-budget', 17, 60000, 17), true);
  assert.equal(await consumeLimit('parallel-budget', 17, 60000), false);
  await (await getMongoDb()).collection('app_usage_counters').updateOne({ _id: 'parallel-budget' }, { $set: { until_at: new Date(0) } });
  assert.equal(await consumeLimit('parallel-budget', 17, 60000, 17), true);
});

test('ledger compare-and-swap has one winner and retries retain concurrent updates', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => mongoRequest('rpc/speaknow_commit_usage', { method: 'POST', body: { owner_id: 'cas-owner', expected_revision: 0, next_state: { sessions: {}, operations: {}, measurements: [], winner: i } } })));
  assert.equal(results.filter(Boolean).length, 1);
  await Promise.all(Array.from({ length: 12 }, () => mutateLedger('cas-owner', ledger => { ledger.count = (ledger.count || 0) + 1; })));
  assert.equal((await readLedger('cas-owner')).count, 12);
  await mutateLedger('another-owner', ledger => { ledger.count = 99; });
  assert.equal((await readLedger('cas-owner')).count, 12);
  assert.equal((await readLedgerPage(0, 1)).length, 1);
});

test('membership entitlement and actual usage remain durable', async () => {
  await provisionMembership('membership-owner', { planType: 'vip', subscriptionStatus: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' });
  assert.equal((await readMembership('membership-owner')).planType, 'vip');
  await recordUsage({ id: 'usage-1', user_id: 'membership-owner', endpoint: 'test', requests: 1, input_tokens: 5, output_tokens: 2, latency_ms: 1, source: 'fixture', created_date: new Date().toISOString() });
  assert.equal((await mongoRequest('app_api_usage', { query: 'user_id=eq.membership-owner' }))[0].input_tokens, 5);
});

test('recordings round-trip bytes, reject overwrite and missing/oversized objects', async () => {
  const bytes = Buffer.from([0, 1, 2, 255, 128, 17]);
  await mediaObject('owner/practice/take', { method: 'POST', data: bytes, mime: 'audio/webm' });
  await closeMongo();
  assert.deepEqual(await mediaObject('owner/practice/take'), bytes);
  await assert.rejects(() => mediaObject('owner/practice/take', { method: 'POST', data: Buffer.from('changed'), mime: 'audio/webm' }), error => error.status === 409);
  await assert.rejects(() => mediaObject('owner/practice/large', { method: 'POST', data: Buffer.alloc(10485761) }), error => error.status === 400);
  await mediaObject('owner/practice/take', { method: 'DELETE' });
  await assert.rejects(() => mediaObject('owner/practice/take'), error => error.status === 404);
});

test('concurrent Impact recording append retains every immutable recording', async () => {
  await saveOwned('presentationSessions', 'impact-owner', { id: 'impact-practice', report: { impact: { recordings: [], recordingIds: [] } } });
  await Promise.all(Array.from({ length: 12 }, (_, i) => updateImpact('impact-owner', 'impact-practice', 'append', { recording: { id: `take-${i}`, mime: 'audio/webm', bytes: 100 } })));
  const saved = await getOwned('presentationSessions', 'impact-owner', 'impact-practice');
  assert.equal(saved.report.impact.recordings.length, 12);
  await assert.rejects(() => updateImpact('impact-owner', 'impact-practice', 'append', { recording: { id: 'take-0', mime: 'audio/webm', bytes: 200 } }), error => error.status === 409);
  await assert.rejects(() => updateImpact('stranger', 'impact-practice', 'analysis', { analysis: {} }), error => error.status === 404);
});

test('practice API reports MongoDB cloud persistence across save, retry and history', async () => {
  const owner = 'api-owner', id = randomUUID();
  const call = async body => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await practiceHandler({ method: 'POST', user: { id: owner }, body }, res);
    assert.equal(res.code, 200); return res.value;
  };
  const attempt = { id, track: 'daily', taskId: 'daily', createdAt: new Date().toISOString(), answers: [{ text: 'MongoDB integration fixture.', questionIndex: 0, inputMode: 'text' }] };
  assert.equal((await call({ action: 'save', attempt })).storageMode, 'mongodb');
  assert.equal((await call({ action: 'save', attempt })).storageMode, 'mongodb');
  assert.equal((await call({ action: 'get', id })).storageMode, 'mongodb');
  assert.equal((await call({ action: 'list' })).length, 1);
});

test('administrator analytics use MongoDB and preflight checks actual read/write', async () => {
  await appendAdminEvent({ type: 'test', user: { id: 'admin-report-user', email: 'report@example.invalid' }, payload: { fixture: true } });
  const report = await listAdminData();
  assert.equal(report.provider, 'mongodb'); assert.equal(report.events.length, 1);
  assert.equal((await checkMongoHealth()).ok, true);
  assert.equal((await checkStorageHealth()).ok, true);
  assert.equal(await (await getMongoDb()).collection('speaknow_deployment_checks').countDocuments(), 0);
});

test('adapter rejects operators and unfiltered writes; failures expose no URI', async () => {
  for (const query of ['$where=eq.x', 'id=gt.x', 'select=password.$x']) await assert.rejects(() => mongoRequest('app_users', { query }), error => error.status === 400);
  await assert.rejects(() => mongoRequest('app_users', { method: 'DELETE' }), error => error.status === 400);
  assert.deepEqual(await mongoRequest('app_users', { query: 'id=eq.%7B%22%24ne%22%3Anull%7D' }), []);
  const uri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'invalid-secret-uri';
  try { await assert.rejects(() => getUserById('any'), error => error.status === 503 && !error.message.includes('invalid-secret-uri')); }
  finally { process.env.MONGODB_URI = uri; }
});
