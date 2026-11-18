import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-industrial-storage-'));
const { handler } = await import('../../api/speaking-practice.js');
const owner = randomUUID();
async function call(body) {
  const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await handler({ method: 'POST', user: { id: owner }, body }, response);
  assert.equal(response.code, 200);
  return response.value;
}
test('server-local saves, reads and history explicitly disclose non-cloud storage', async () => {
  const attempt = { id: randomUUID(), track: 'daily', taskId: 'daily', createdAt: new Date().toISOString(), answers: [{ text: 'Engineering fixture only.', questionIndex: 0, inputMode: 'text' }] };
  const saved = await call({ action: 'save', attempt });
  const repeated = await call({ action: 'save', attempt });
  const loaded = await call({ action: 'get', id: attempt.id });
  const listed = await call({ action: 'list' });
  for (const value of [saved, repeated, loaded, ...listed]) assert.equal(value.storageMode, 'server-local');
  assert.equal(listed.length, 1);
});
