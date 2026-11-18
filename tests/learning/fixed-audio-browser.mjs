import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  // This checks UI and playback fallback, not membership or provider services.
  await page.route('**/api/membership', route => route.fulfill({ json: { id: 'audio-ui-check', shadow: true } }));
  await page.route('**/fixed-audio/manifest.json', route => route.fulfill({ json: { version: 1, entries: [] } }));
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Controlled browser voice' }], addEventListener() {}, resume() {}, cancel() {}, speak(utterance) { window.__spoken.push(utterance.text); utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 50); } } });
  });
  const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:15212';
  await page.goto(`${origin}/exam/prepare?task=toefl-repeat-campus-v1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: 'Play sentence' }).click();
  await page.getByRole('button', { name: 'Listen again', exact: true }).waitFor();
  assert.equal(await page.getByText('Browser voice', { exact: true }).count(), 0);
  assert.equal(await page.getByText('The sentence is hidden while you answer.', { exact: false }).count(), 0);
  assert.equal(await page.getByText('The library opens at nine.', { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__spoken), ['The library opens at nine.']);
  await page.getByRole('button', { name: 'Listen again' }).click();
  await page.waitForFunction(() => window.__spoken.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__spoken), ['The library opens at nine.', 'The library opens at nine.']);
  console.log('PASS: audio fallback and replay work without exposing provider labels, implementation copy or the reference sentence.');
} finally { await browser.close(); }
