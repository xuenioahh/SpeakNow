import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-admin-storage-'));
process.env.SPEAKNOW_DATA_DIR = dir;
process.env.FORCE_LOCAL_DATA = 'true';
const local = await import('../../api/_adminStore.js');
const file = path.join(dir, 'admin-db.json');
after(() => fs.rm(dir, { recursive: true, force: true }));

test('admin events use the configured directory and concurrent writes retain every event', async () => {
  await Promise.all(Array.from({ length: 12 }, (_, n) => local.appendAdminEvent({
    user: { id: 'isolated-user', email: 'isolated@example.test' }, payload: { n },
  })));
  const data = await local.listAdminData();
  assert.equal(data.events.length, 12);
  assert.equal(new Set(data.events.map(event => event.payload.n)).size, 12);
  assert.equal(data.users.length, 1);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).events.length, 12);
  await assert.rejects(local.deleteAdminRecord({ collection: 'users', id: 'isolated-user' }), { status: 400 });
});

test('malformed admin storage is preserved and rejected on read and write', async () => {
  for (const bad of ['{broken', '{"users":[]}']) {
    await fs.writeFile(file, bad);
    await assert.rejects(local.listAdminData(), { status: 503 });
    await assert.rejects(local.appendAdminEvent({ type: 'test' }), { status: 503 });
    assert.equal(await fs.readFile(file, 'utf8'), bad);
  }
});

test('cloud read/write/delete failures never fall back to local storage', async () => {
  process.env.FORCE_LOCAL_DATA = 'false';
  process.env.SUPABASE_URL = 'https://storage.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const remote = await import('../../api/_adminStore.js?remote-test');
  const originalFetch = globalThis.fetch;
  const before = await fs.readFile(file, 'utf8');
  try {
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    for (const action of [() => remote.listAdminData(), () => remote.appendAdminEvent({ user: { id: 'test' } }), () => remote.deleteAdminRecord({ collection: 'events', id: 'test' })]) {
      await assert.rejects(action(), { status: 503 });
      assert.equal(await fs.readFile(file, 'utf8'), before);
    }
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), ...options });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await remote.appendAdminEvent({ user: { id: 'test' } });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Prefer, 'resolution=merge-duplicates,return=representation');
    assert(!calls.some(call => call.method === 'PATCH'));
  } finally { globalThis.fetch = originalFetch; }
});

test('serverless local admin storage without a persistent directory fails explicitly', async () => {
  delete process.env.SPEAKNOW_DATA_DIR;
  process.env.VERCEL = '1';
  try { await assert.rejects(local.listAdminData(), { status: 503 }); }
  finally { delete process.env.VERCEL; process.env.SPEAKNOW_DATA_DIR = dir; }
});
