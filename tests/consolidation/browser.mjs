// Actual HTTP auth/storage and browser UI; generated media and controlled ASR only.
// No model endpoint is mocked. A missing real key must produce a visible 503.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5190';
const out = new URL('../../../docs/consolidation-artifacts/', import.meta.url); await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['microphone', 'camera'] });
    await context.addInitScript(() => {
      window.SpeechRecognition = class {
        start() { window.__recognition = this; queueMicrotask(() => this.onstart?.()); }
        stop() { queueMicrotask(() => this.onend?.()); }
        abort() { this.onend?.(); }
      };
    });
    const page = await context.newPage(); const errors = [], statuses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('/api/presentation-impact')) statuses.push(response.status()); });
    await page.goto(base + '/auth');
    await page.getByRole('button', { name: /Need an account.*Register/i }).click();
    await page.getByLabel('Full name').fill('Consolidation Browser');
    await page.getByLabel('Email').fill(`browser-${width}-${Date.now()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill('test-browser-password');
    await page.getByRole('button', { name: /^Create account$/i }).click();
    await page.waitForURL(base + '/');
    const cookies = await context.cookies();
    assert(cookies.some(cookie => cookie.name === 'speaknow_session' && cookie.httpOnly));
    assert(!(await page.evaluate(() => document.cookie)).includes('speaknow_session='));
    await page.goto(base + '/presentation');
    await page.getByLabel('Presentation Topic').fill('A controlled communication rehearsal');
    await page.getByLabel('Core Message', { exact: true }).fill('We should evaluate the proposed caching change with evidence.');
    await page.getByLabel('Desired Outcome', { exact: true }).fill('Understand the proposal and its limitations.');
    await page.getByRole('button', { name: 'Business Audience', exact: true }).click();
    await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
    await page.getByRole('heading', { name: 'Your 5-minute English presentation' }).waitFor();
    await page.locator('.voice-orb canvas').waitFor();
    await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Recording', exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const result = Object.assign([{ transcript: 'We propose caching repeated requests. We have not yet tested the reliability benefit. A small evaluation can check the trade-off before a rollout.' }], { isFinal: true });
      window.__recognition.onresult({ resultIndex: 0, results: [result] });
    });
    await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
    await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
    await page.waitForURL('**/presentation/report?session=*');
    const id = new URL(page.url()).searchParams.get('session');
    await page.getByText(/configure OPENAI_API_KEY/i).waitFor();
    assert(statuses.includes(503));
    await page.locator('.impact-replay video').waitFor();
    await page.locator('.impact-replay video').first().evaluate(async video => { await video.play(); video.pause(); });
    await page.reload(); await page.getByRole('heading', { name: 'Your presentation · one change to practise' }).waitFor();
    for (const size of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: size, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${size}`);
    }
    await page.goto(base + '/presentation/history'); await page.getByRole('button', { name: 'Open Impact Report' }).first().click();
    assert(page.url().includes(id));
    const anonymous = await browser.newContext();
    const denied = await anonymous.request.post(base + '/api/presentation-practice', { data: { action: 'get', id }, headers: { 'x-user-id': 'forged' } });
    assert.equal(denied.status(), 401); await anonymous.close();
    assert.deepEqual(errors, []);
    results.push({ width, id, authentication: 'actual server session', media: 'actual MediaRecorder using generated Chromium audio; controlled ASR event', model: 'real endpoint returned 503, no mock model', browserErrors: errors, status: 'PASS engineering flow; AI quality BLOCKED' });
    await context.close();
  }
  await fs.writeFile(new URL('browser-results.json', out), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
