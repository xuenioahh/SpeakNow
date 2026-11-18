import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = 'http://127.0.0.1:5240';
const output = 'docs/industrial-audit-2026-11-10/failure-browser.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const passed = [], errors = [];
const report = { category: 'Mock browser failure tests + isolated local-server persistence', passed, errors };
const context = await browser.newContext({ permissions: ['camera'] });
const page = await context.newPage();
page.setDefaultTimeout(35000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    window.__streams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      if (window.__denyCamera && options.video) throw new DOMException('Engineering permission failure', 'NotAllowedError');
      const stream = await original(options); window.__streams.push(stream); return stream;
    };
  });
  await page.goto(origin);
  await page.evaluate(() => { window.__denyCamera = true; });
  await page.getByRole('link', { name: 'Speaking', exact: true }).click();
  await page.evaluate(() => { history.pushState({}, '', '/voice/chat?scenario=cafe&cue=menu&camera=analysis'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Camera unavailable. Voice practice still works; turn the camera off and retry.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Turn voice off', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your reply', exact: true }).fill('Camera denial must not block text conversation.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await page.getByLabel('Live conversation').getByText('Engineering fixture: would you like a small or large coffee?', { exact: true }).waitFor();
  passed.push('Camera permission failure is visible and typed conversation still works');

  await page.route('**/expression-vision/**', route => route.abort('failed'));
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=analysis`);
  await page.getByText('Visual analysis unavailable · voice practice still works', { exact: true }).waitFor();
  await page.goto(origin);
  assert.ok(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
  await page.unroute('**/expression-vision/**');
  passed.push('Model loading failure is visible, navigation stops media tracks');

  const email = `audit-${randomUUID()}@example.invalid`, password = `Audit-${randomUUID()}`;
  await page.evaluate(async ({ email, password }) => {
    const { apiJson } = await import('/src/api/http.js');
    await apiJson('/api/local-data', { action: 'register', email, password, full_name: 'Engineering audit fixture' });
  }, { email, password });
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off`);
  await page.getByRole('button', { name: 'Turn voice off', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your reply', exact: true }).fill('This is a local persistence contract fixture.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await page.getByLabel('Live conversation').getByText('Engineering fixture: would you like a small or large coffee?', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Finish & review', exact: true }).click();
  await page.waitForURL('**/practice/review?id=*');
  await page.getByRole('button', { name: 'Save to my account', exact: true }).click();
  await page.getByText('Saved on this server · not cloud-synced', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Get feedback', exact: true }).click();
  await page.locator('.review-summary').waitFor();
  const saved = await page.evaluate(async () => {
    const { learningStore } = await import('/src/lib/learningStore.js');
    const id = new URLSearchParams(location.search).get('id'), value = await learningStore.get('attempts', id);
    await learningStore.remove('attempts', id); return value;
  });
  assert.equal(saved.cloudSaved, false); assert.equal(saved.accountSaved, true); assert.equal(saved.storageMode, 'server-local');
  assert.equal(saved.feedbackCloudSaved, false); assert.equal(saved.feedbackAccountSaved, true);
  await page.reload(); await page.locator('.review-summary').waitFor();
  await page.getByText('Saved on this server · not cloud-synced', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save to my account', exact: true }).count(), 0);
  passed.push('Account save, feedback, cache removal and server retrieval preserve data without claiming Supabase');
  const csrfStatus = await page.evaluate(async () => (await fetch('/api/speaking-practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"list"}' })).status);
  assert.equal(csrfStatus, 403);
  passed.push('Authenticated write without CSRF token is rejected');
  assert.deepEqual(errors, []); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message;
  report.visibleState = (await page.locator('body').innerText().catch(() => '')).slice(-1400);
  console.error(error.message); process.exitCode = 1;
} finally { await fs.writeFile(output, JSON.stringify(report, null, 2)); await browser.close(); }
