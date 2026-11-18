import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const folder = 'docs/local-2026-11-05';
await fs.mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(45000);
const errors = [], apiFailures = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) apiFailures.push({ url: new URL(response.url()).pathname, status: response.status() }); });
// Only hardware speech playback is controlled. HTTP, storage and AI are real.
await page.addInitScript(() => {
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [{ lang: 'en-US', name: 'Controlled test voice' }], addEventListener() {}, resume() {}, cancel() {},
    speak(utterance) { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 1500); },
  } });
});
const draft = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).map(key => JSON.parse(localStorage.getItem(key))).find(value => value.messages));
try {
  for (const route of ['/', '/exam', '/progress', '/voice']) {
    const response = await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.ok((await page.locator('body').innerText()).length > 50);
    checks.push(`page ${route}`);
  }
  await page.goto('http://localhost:5173/voice/prepare?scenario=cafe&camera=off&clip=off', { waitUntil: 'networkidle' });
  await page.locator('.scenario-canvas canvas').waitFor();
  const startResponse = page.waitForResponse(response => response.url().endsWith('/api/membership') && response.request().postDataJSON()?.action === 'start');
  await page.getByRole('button', { name: 'Start Conversation', exact: true }).click();
  assert.equal((await startResponse).status(), 200);
  await page.waitForURL('**stage=conversation*');
  await page.getByRole('button', { name: 'Pause conversation', exact: true }).click();
  checks.push('Daily Start: real local membership HTTP 200');
  for (const [index, reply] of ['I would like a small cappuccino with oat milk, please.', 'Please make it iced without sugar. I will take it away.'].entries()) {
    await page.getByRole('textbox', { name: 'Your reply' }).fill(reply);
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.waitForFunction(expected => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).map(key => JSON.parse(localStorage.getItem(key))).some(value => value.messages?.filter(message => message.model?.startsWith('deepseek')).length >= expected), index + 1);
  }
  const conversation = await draft();
  checks.push('2 real DeepSeek conversation replies');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${folder}/daily-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Finish & review', exact: true }).click();
  await page.waitForURL('**/practice/review?id=*');
  const feedbackResponse = page.waitForResponse(response => response.url().endsWith('/api/speaking-feedback'), { timeout: 90000 });
  await page.getByRole('button', { name: 'Get feedback', exact: true }).click();
  const feedbackHttp = await feedbackResponse;
  assert.equal(feedbackHttp.status(), 200);
  await feedbackHttp.finished();
  const readAttempt = () => page.evaluate(async () => {
    const { learningStore } = await import('/src/lib/learningStore.js');
    return learningStore.get('attempts', new URLSearchParams(location.search).get('id'));
  });
  let saved;
  for (let attempt = 0; attempt < 60; attempt++) {
    saved = await readAttempt();
    if (saved?.feedback?.source === 'ai') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(saved.answers.length, 2);
  assert.equal(saved.feedback.provider, 'deepseek');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await readAttempt()).id, saved.id);
  checks.push('real AI feedback and IndexedDB persistence after reload');
  await page.screenshot({ path: `${folder}/feedback.png`, fullPage: true });
  assert.deepEqual(apiFailures, []);
  assert.deepEqual(errors, []);
  const report = { at: new Date().toISOString(), passed: true, checks, errors, apiFailures,
    replies: conversation.messages.filter(message => message.model).map(message => ({ text: message.content, model: message.model })),
    feedback: { provider: saved.feedback.provider, model: saved.feedback.model, summary: saved.feedback.summary },
    scope: 'Real local HTTP, membership storage, DeepSeek conversation and feedback, IndexedDB, 320/390/1280 layouts. Controlled speech playback; physical microphone, ASR and camera not verified.' };
  await fs.writeFile(`${folder}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error.stack);
  console.error((await page.locator('body').innerText()).slice(-2200));
  await page.screenshot({ path: `${folder}/failure.png`, fullPage: true });
  process.exitCode = 1;
} finally { await browser.close(); }
