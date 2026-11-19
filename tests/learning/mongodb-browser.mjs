import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const output = 'docs/mongodb-2026-11-18';
await fs.mkdir(output, { recursive: true });
const temporaryServer = http.createServer();
await new Promise(resolve => temporaryServer.listen(0, '127.0.0.1', resolve));
const backendPort = temporaryServer.address().port;
await new Promise(resolve => temporaryServer.close(resolve));
let mongo, vite, backend, browser;
const checks = [], errors = [];
try {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' }, instance: { ip: '127.0.0.1' } });
  process.env.BACKEND_PORT = String(backendPort);
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  backend = spawn(process.execPath, ['backend/server.js'], { env: { ...process.env,
    SPEAKNOW_STORAGE_PROVIDER: 'mongodb', MONGODB_URI: mongo.getUri(), MONGODB_DB: 'browser_isolated',
    FORCE_LOCAL_DATA: 'false', BACKEND_HOST: '127.0.0.1', SPEAKNOW_ORIGIN: origin,
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let backendOutput = '';
  backend.stdout.on('data', value => { backendOutput += value; });
  backend.stderr.on('data', value => { backendOutput += value; });
  for (let n = 0; n < 100; n++) {
    if (backendOutput.includes('Local backend listening')) break;
    try { if ((await fetch(`http://127.0.0.1:${backendPort}/api/missing`)).status === 404) break; } catch {}
    if (backend.exitCode !== null) throw new Error('Test backend exited');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/auth');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  const email = `mongo-${Date.now()}@example.invalid`, password = randomUUID();
  await page.getByLabel('Full name').fill('MongoDB integration');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(origin + '/');
  checks.push('Real UI registration and authenticated session with MongoDB');
  const id = randomUUID();
  const saved = await page.evaluate(async id => {
    const { localApi } = await import('/src/api/localClient.js');
    const { cloudAttempt } = await import('/src/lib/learningStore.js');
    const user = await localApi.auth.me();
    return cloudAttempt({ id, track: 'daily', taskId: 'daily', createdAt: new Date().toISOString(), answers: [{ questionIndex: 0, text: 'I would like to practise speaking today.', inputMode: 'text' }] }, user.id);
  }, id);
  assert.equal(saved.storageMode, 'mongodb'); assert.equal(saved.cloudSaved, true);
  checks.push('Browser IndexedDB and account sync mark MongoDB saves as cloud-saved');
  await page.goto(`${origin}/practice/review?id=${id}`);
  await page.getByText('Synced to your account', { exact: true }).waitFor();
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.screenshot({ path: `${output}/mongodb-review-${width}.png`, fullPage: true });
  }
  checks.push('MongoDB sync label, light theme and review layout at 1365/390/320px');
  await page.evaluate(async () => { const { localApi } = await import('/src/api/localClient.js'); await localApi.auth.logout(); });
  await page.goto(origin + '/auth');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(origin + '/');
  const history = await page.evaluate(async () => {
    const { apiJson } = await import('/src/api/http.js');
    return apiJson('/api/speaking-practice', { action: 'list' });
  });
  assert.ok(history.some(row => row.id === id && row.storageMode === 'mongodb'));
  checks.push('Logout, password login and account history reload persist through MongoDB');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/browser.json`, JSON.stringify({ checks, errors, scope: 'Local real MongoDB and real browser; no Atlas deployment or AI-provider call' }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close();
  if (backend && backend.exitCode === null) {
    const exited = new Promise(resolve => backend.once('exit', resolve));
    backend.kill('SIGTERM'); await exited;
  }
  await vite?.close();
  await mongo?.stop();
}
