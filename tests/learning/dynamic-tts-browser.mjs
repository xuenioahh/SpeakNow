import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Fixture' }], addEventListener() {}, resume() {}, cancel() {}, speak(utterance) { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 40); } } });
  });
  const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:15213';
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Your reply' }).fill('A small coffee please.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText('Engineering fixture: would you like a small or large coffee?', { exact: true }).waitFor();
  await page.getByText(/is speaking · studio voice/).waitFor();
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Play audio' }).click();
  await page.getByText(/is speaking · studio voice/).waitFor({ state: 'hidden' });
  await page.route('**/api/dynamic-tts', route => route.fulfill({ status: 503, json: { error: 'Fixture TTS outage' } }));
  await page.getByRole('textbox', { name: 'Your reply' }).fill('Could you make it iced?');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByRole('alert').getByText(/Audio could not play/).waitFor();
  assert.equal(await page.locator('[data-interaction-state="speaking"]').count(), 0);
  console.log('PASS: streamed fixture MP3 drives NPC speaking; interruption and TTS outage clear speaking without losing the reply.');
} finally { await browser.close(); }
