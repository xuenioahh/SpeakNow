import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-security-'));
process.env.SPEAKNOW_DATA_DIR = dir;
process.env.FORCE_LOCAL_DATA = 'true';
const { default: localData } = await import('../../api/local-data.js');
const { default: practice } = await import('../../api/presentation-practice.js');
const { default: media } = await import('../../api/presentation-media.js');
const { default: impact } = await import('../../api/presentation-impact.js');
const { default: admin } = await import('../../api/admin-track.js');
const { listOwned, saveOwned, getOwned } = await import('../../api/_appStore.js');
const { consumeLimit } = await import('../../api/_securityStore.js');
const { context, transcript, fixture } = await import('../impact/fixtures.js');

async function call(handler, body, auth = {}, method = 'POST', extra = {}) {
  let code = 200, result; const responseHeaders = {};
  const req = { method, body, url: '/api/test', headers: { host: 'localhost', ...(auth.cookie ? { cookie: auth.cookie } : {}), ...(auth.csrf ? { 'x-csrf-token': auth.csrf } : {}), ...extra }, socket: { remoteAddress: '127.0.0.1' } };
  await handler(req, { status(value) { code = value; return this; }, get headersSent() { return result !== undefined; }, setHeader(key, value) { responseHeaders[key] = value; }, json(value) { result = value; } });
  return { code, result, headers: responseHeaders };
}
function authFrom(response) {
  const lines = response.headers['Set-Cookie'];
  return { cookie: lines.map(line => line.split(';')[0]).join('; '), csrf: lines.find(line => line.startsWith('speaknow_csrf=')).split(';')[0].split('=')[1] };
}
let a, b, aUser, bUser, original;
test('register/login issue opaque HttpOnly session; passwords are salted hashes', async () => {
  const A = await call(localData, { action: 'register', full_name: 'A', email: 'a@example.test', password: 'correct-password-a' });
  const B = await call(localData, { action: 'register', full_name: 'B', email: 'b@example.test', password: 'correct-password-b' });
  assert.equal(A.code, 200); assert.equal(B.code, 200);
  a = authFrom(A); b = authFrom(B); aUser = A.result.data; bUser = B.result.data;
  assert.match(A.headers['Set-Cookie'][0], /HttpOnly.*SameSite=Strict/);
  assert.equal(aUser.password, undefined);
  const data = JSON.parse(await fs.readFile(path.join(dir, 'app-db.json')));
  assert(data.users.every(user => user.password.startsWith('scrypt$')));
  assert(!JSON.stringify(data).includes('correct-password'));
  const login = await call(localData, { action: 'login', email: 'a@example.test', password: 'correct-password-a' });
  assert.equal(login.code, 200); a = authFrom(login);
  assert.equal((await call(localData, { action: 'login', email: 'a@example.test', password: 'wrong' })).code, 401);
});
test('forged ID/token, CSRF and cross-origin requests cannot authorize', async () => {
  assert.equal((await call(localData, { action: 'me' }, {}, 'POST', { 'x-user-id': aUser.id })).code, 401);
  assert.equal((await call(localData, { action: 'me' }, { cookie: 'speaknow_session=' + 'f'.repeat(64), csrf: a.csrf })).code, 401);
  assert.equal((await call(localData, { action: 'me' }, { cookie: a.cookie })).code, 403);
  assert.equal((await call(localData, { action: 'me' }, a, 'POST', { origin: 'https://attacker.example' })).code, 403);
  assert.equal((await call(localData, { action: 'updateMe', role: 'admin' }, a)).code, 400);
});
test('practice ownership, immutable transcript, linked target and private audio isolation', async () => {
  const id = randomUUID();
  const saved = await call(practice, { action: 'save', id, context, transcript, inputSource: 'transcribed', duration: 12 }, a);
  assert.equal(saved.code, 200); original = saved.result.session;
  assert.equal(original.user_id, aUser.id);
  assert.equal((await call(practice, { action: 'get', id }, b)).code, 404);
  assert.equal((await call(localData, { action: 'getEntity', entity: 'PresentationSession', id }, b)).code, 404);
  assert.equal((await call(localData, { action: 'deleteEntity', entity: 'PresentationSession', id }, b)).code, 404);
  const uploaded = await call(media, { action: 'save', sessionId: id, dataUrl: 'data:audio/webm;base64,GkXfow==' }, a);
  assert.equal(uploaded.code, 200);
  const recordingId = uploaded.result.recordingId.split(':')[1];
  assert.equal((await call(media, { action: 'read', sessionId: id, recordingId }, b)).code, 404);
  assert.equal((await call(media, { action: 'read', sessionId: id, recordingId }, a)).code, 200);
  assert.equal((await call(practice, { action: 'save', id, context, transcript: 'Changed', inputSource: 'typed' }, a)).code, 409);
  assert.equal((await call(practice, { action: 'save', id: randomUUID(), context, transcript, inputSource: 'typed', parentPracticeId: id, kind: 'moment', targetId: 'invented' }, a)).code, 400);
  const analysis = fixture();
  const { validateAnalysis } = await import('../../src/impact/contracts.js');
  const fresh = await getOwned('presentationSessions', aUser.id, id);
  fresh.report.impact.analysis = validateAnalysis(analysis, transcript, context, id);
  await saveOwned('presentationSessions', aUser.id, fresh, { update: true });
  const target = fresh.report.impact.analysis.audiences.find(view => view.audienceType === context.targetAudience).primary;
  for (let i = 0; i < 3; i++) {
    const retry = await call(practice, { action: 'save', id: randomUUID(), context, transcript: `Actual test retry ${i}: preserve the supplied evidence and message.`, inputSource: 'typed', parentPracticeId: id, kind: 'moment', targetId: target.id }, a);
    assert.equal(retry.code, 200); assert.equal(retry.result.session.report.impact.target.originalText, target.originalText);
  }
  const changedAudience = await call(practice, { action: 'save', id: randomUUID(), context: { ...context, audienceDescription: 'Different listeners for an incomparable attempt.' }, transcript, inputSource: 'typed', parentPracticeId: id, kind: 'moment', targetId: target.id }, a);
  assert.equal(changedAudience.code, 400);
  assert.equal((await call(practice, { action: 'linked', id }, a)).result.sessions.length, 3);
  assert.equal((await getOwned('presentationSessions', aUser.id, id)).report.impact.transcript, transcript);
  assert.equal((await listOwned('presentationSessions', bUser.id)).length, 0);
});
test('all sensitive public API defaults reject anonymous and ID-header access', async () => {
  for (const endpoint of ['voice-chat', 'presentation-analysis', 'presentation-pause-feedback', 'presentation-report', 'presentation-impact', 'expression-review', 'expression-service', 'presentation-practice', 'presentation-media', 'admin-track']) {
    const handler = (await import(`../../api/${endpoint}.js`)).default;
    const result = await call(handler, { practiceId: original.id }, {}, endpoint === 'expression-service' ? 'GET' : 'POST', { 'x-user-id': aUser.id, 'x-admin-key': 'forged' });
    assert.equal(result.code, 401, endpoint);
  }
  assert.equal((await call(admin, {}, a, 'GET')).code, 403);
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  // A fresh practice makes a real availability call, not a cached test fixture.
  const saved = await call(practice, { action: 'save', id: randomUUID(), context, transcript, inputSource: 'typed' }, a);
  assert.equal((await call(impact, { practiceId: saved.result.session.id }, a)).code, 503);
  if (previous) process.env.OPENAI_API_KEY = previous;
});
test('retrying an acknowledged recording upload keeps one immutable recording', async () => {
  const recordingId = randomUUID(), body = { action: 'save', sessionId: original.id, recordingId, dataUrl: 'data:audio/webm;base64,GkXfow==' };
  const first = await call(media, body, a), repeated = await call(media, body, a);
  assert.equal(first.code, 200); assert.equal(repeated.code, 200); assert.equal(first.result.recordingId, repeated.result.recordingId);
  const saved = await getOwned('presentationSessions', aUser.id, original.id);
  assert.equal(saved.report.impact.recordings.filter(recording => recording.id === recordingId).length, 1);
  assert.equal((await call(media, { ...body, dataUrl: 'data:audio/webm;base64,YWJjZA==' }, a)).code, 409);
});

test('concurrent identical uploads publish one complete immutable recording', async () => {
  const { mediaHandler } = await import('../../api/presentation-media.js');
  const ownedMedia = (req, res) => mediaHandler({ ...req, user: aUser }, res);
  const recordingId = randomUUID();
  const dataUrl = `data:audio/webm;base64,${Buffer.alloc(1024 * 1024, 42).toString('base64')}`;
  const body = { action: 'save', sessionId: original.id, recordingId, dataUrl };
  // Enter together after authentication, without rate-counter serialization.
  const results = await Promise.all(Array.from({ length: 5 }, () => call(ownedMedia, body)));
  assert.deepEqual(results.map(result => result.code), [200, 200, 200, 200, 200]);
  const saved = await getOwned('presentationSessions', aUser.id, original.id);
  assert.equal(saved.report.impact.recordings.filter(item => item.id === recordingId).length, 1);
  assert.equal(saved.report.impact.recordingIds.filter(id => id === `${original.id}:${recordingId}`).length, 1);
  assert.equal((await call(media, { action: 'read', sessionId: original.id, recordingId }, a)).result.dataUrl, dataUrl);
});

test('concurrent metadata attachment is idempotent, including at the recording limit', async () => {
  const { updateImpact } = await import('../../api/_appStore.js');
  const saved = await call(practice, { action: 'save', id: randomUUID(), context, transcript, inputSource: 'typed' }, a);
  const id = saved.result.session.id;
  const recording = { id: randomUUID(), mime: 'audio/webm', bytes: 4, source: 'typed' };
  await Promise.all(Array.from({ length: 5 }, () => updateImpact(aUser.id, id, 'append', { recording })));
  assert.equal((await getOwned('presentationSessions', aUser.id, id)).report.impact.recordings.length, 1);
  for (let i = 1; i < 20; i++) await updateImpact(aUser.id, id, 'append', { recording: { ...recording, id: randomUUID() } });
  await updateImpact(aUser.id, id, 'append', { recording });
  await assert.rejects(updateImpact(aUser.id, id, 'append', { recording: { ...recording, mime: 'audio/ogg' } }), { status: 409 });
  assert.equal((await getOwned('presentationSessions', aUser.id, id)).report.impact.recordings.length, 20);
});

test('an uploaded object without metadata can be recovered without replacing its bytes', async () => {
  const { mediaObject } = await import('../../api/_mediaStore.js');
  const recordingId = randomUUID(), data = Buffer.from('recoverable-recording');
  await mediaObject(`${aUser.id}/${original.id}/${recordingId}`, { method: 'POST', data, mime: 'audio/webm' });
  const body = { action: 'save', sessionId: original.id, recordingId, dataUrl: `data:audio/webm;base64,${data.toString('base64')}` };
  assert.equal((await call(media, { ...body, dataUrl: 'data:audio/webm;base64,YWJjZA==' }, a)).code, 409);
  assert.equal((await call(media, body, a)).code, 200);
  assert.equal((await call(media, { action: 'read', sessionId: original.id, recordingId }, a)).result.dataUrl, body.dataUrl);
});

test('admin session events use owned server records and preserve authorization errors', async () => {
  assert.equal((await call(admin, { type: 'presentation_session_saved', payload: { session: { id: original.id } } }, b)).code, 404);
  assert.equal((await call(admin, { action: 'delete_record', collection: 'events', id: 'forged' }, a)).code, 403);
  const saved = await call(admin, { type: 'presentation_session_saved', payload: { session: { id: original.id, user_id: bUser.id, report: { forged: true } } } }, a);
  assert.equal(saved.code, 200);
  const db = JSON.parse(await fs.readFile(path.join(dir, 'admin-db.json'), 'utf8'));
  assert.equal(db.presentationSessions[0].user_id, aUser.id);
  assert.equal(db.presentationSessions[0].report.forged, undefined);
});

test('server counters are atomic and revoked sessions cannot be replayed', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => consumeLimit('concurrent-test', 3, 60000)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal((await call(localData, { action: 'logout' }, a)).code, 200);
  assert.equal((await call(localData, { action: 'me' }, a)).code, 401);
});
test('corrupt storage fails explicitly without resetting existing bytes', async () => {
  const file = path.join(dir, 'security-db.json'); const bad = '{corrupt';
  await fs.writeFile(file, bad);
  const result = await call(localData, { action: 'me' }, b);
  assert.equal(result.code, 503); assert.equal(await fs.readFile(file, 'utf8'), bad);
});

