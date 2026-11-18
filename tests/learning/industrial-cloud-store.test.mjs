import test from 'node:test';
import assert from 'node:assert/strict';
process.env.FORCE_LOCAL_DATA = 'false';
process.env.SUPABASE_URL = 'https://storage.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'engineering-fixture-not-a-key';
const { getOwned, readAppStore } = await import('../../api/_appStore.js');
test('account storage requests have a bounded cancellation signal', async () => {
  const original = globalThis.fetch;
  let options;
  globalThis.fetch = async (_url, value) => { options = value; return Response.json([]); };
  try {
    assert.equal(await getOwned('voiceSessions', 'fixture-owner', 'fixture-attempt'), null);
    assert.ok(options.signal instanceof AbortSignal);
  } finally { globalThis.fetch = original; }
});
test('account storage failures do not propagate raw provider or private data', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: 'private-learner-details', code: 'PGRST205' }, { status: 503 });
  try { await assert.rejects(getOwned('voiceSessions', 'fixture-owner', 'fixture-attempt'), error => error.status === 503 && error.code === 'storage_unavailable' && !error.message.includes('private-learner-details')); }
  finally { globalThis.fetch = original; }
});
test('sanitized storage errors preserve the existing optional-settings compatibility', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('app_settings') ? Response.json({ code: 'PGRST205', message: 'private internal detail' }, { status: 404 }) : Response.json([]);
  try { const store = await readAppStore(); assert.deepEqual(store.settings, { adminEmails: [] }); }
  finally { globalThis.fetch = original; }
});
