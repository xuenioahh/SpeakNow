import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getSpeakingTask } from '../../shared/speakingTasks.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5194';
const output = 'docs/feedback-2026-11-13'; await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(20000);
const report = { scope: 'Mock integration in real Chromium: controlled recognition, TTS and model; real MediaRecorder with fake device; isolated local database. Not real voice/model acceptance.', passed: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
await page.addInitScript(() => {
  window.__streams = [];
  const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => { const stream = await get(options); window.__streams.push(stream); return stream; };
  window.SpeechRecognition = class {
    start() { this.timer = setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); const result = [{ transcript: 'I take the bus because it is cheaper.' }]; result.isFinal = true; this.onresult?.({ results: [result] }); }, 40); }
    stop() { clearTimeout(this.timer); this.onaudioend?.(); setTimeout(() => this.onend?.(), 30); }
    abort() { clearTimeout(this.timer); }
  };
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Controlled fixture' }], addEventListener() {}, resume() {}, cancel() {}, speak(u) { u.onstart?.(); setTimeout(() => u.onend?.(), 40); } } });
});
const task = getSpeakingTask('toefl-repeat-campus-v1');
const button = name => page.getByRole('button', { name, exact: true });
async function start(taskId = task.id, mode = 'practice') {
  await page.goto(`${origin}/exam/practice?task=${taskId}&sessionMode=${mode}`);
  await page.getByRole('radio', { name: mode === 'exam' ? /^Exam / : /^Practice / }).check();
  await button(mode === 'exam' ? 'Start Exam' : 'Start Practice').click();
  await page.locator('.exam-question').waitFor();
}
async function record(index = 0, repeat = true) {
  if (repeat) await button('Play sentence').click();
  await button('Record answer').click();
  await button('Stop recording').waitFor(); await page.waitForTimeout(750);
  await button('Stop recording').click();
  await button('Try again').waitFor();
  if (repeat) await page.getByRole('textbox', { name: 'Your transcript' }).fill(task.prompts[index].split(' ').slice(1).join(' '));
}
async function snapshot() {
  return page.evaluate(async () => { const { learningStore: store } = await import('/src/lib/learningStore.js'); return { drafts: await store.all('drafts'), attempts: await store.all('attempts'), clips: (await store.all('recordings')).map(r => r.id) }; });
}
async function test(name, fn) { await fn(); report.passed.push(name); console.log('PASS', name); }
try {
  await test('single answer at question 1/7 is reviewed without creating a saved attempt; metrics stay collapsed', async () => {
    await start(); await record();
    await page.getByText('Question 1 / 7', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Word and phrase review').count(), 0);
    assert.equal(await page.getByText('Average level', { exact: true }).isVisible(), false);
    const response = page.waitForResponse(r => r.url().endsWith('/api/speaking-feedback') && r.request().postDataJSON()?.action === 'practice-answer');
    await button('Review this answer').click();
    const result = await response; assert.equal(result.status(), 200);
    assert.equal(result.request().postDataJSON().attempt.answers.length, 1);
    await page.getByLabel('Word and phrase review').waitFor();
    await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
    assert.equal((await snapshot()).attempts.length, 0);
    await page.screenshot({ path: `${output}/single-answer.png`, fullPage: true });
  });
  await test('retry keeps question position, replaces transcript and clears obsolete coaching', async () => {
    await button('Try again').click(); await button('Stop recording').waitFor(); await page.waitForTimeout(700); await button('Stop recording').click();
    await button('Review this answer').waitFor();
    assert.equal(await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).count(), 0);
    await page.getByText('Question 1 / 7', { exact: true }).waitFor();
  });
  await test('failed feedback retains input; edited answer cannot receive a stale delayed result', async () => {
    await page.route('**/api/speaking-feedback', route => route.fulfill({ status: 503, json: { error: 'Controlled feedback outage' } }), { times: 1 });
    const before = await page.getByRole('textbox', { name: 'Your transcript' }).inputValue();
    await button('Review this answer').click(); await page.getByRole('alert').filter({ hasText: 'Controlled feedback outage' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Your transcript' }).inputValue(), before);
    let release; const gate = new Promise(resolve => { release = resolve; });
    let arrived; const arrivedPromise = new Promise(resolve => { arrived = resolve; });
    await page.route('**/api/speaking-feedback', async route => { arrived(); await gate; await route.fulfill({ json: { summary: 'STALE ENGINEERING FIXTURE', improvements: [] } }).catch(() => {}); }, { times: 1 });
    await button('Retry this feedback').click(); await arrivedPromise;
    await page.getByRole('textbox', { name: 'Your transcript' }).fill('An edited answer for the current sentence.');
    release(); await page.waitForTimeout(250);
    assert.equal(await page.getByText('STALE ENGINEERING FIXTURE').count(), 0);
    await button('Review this answer').waitFor();
  });
  await test('discard removes unfinished draft and unshared takes, preserving an earlier saved recording', async () => {
    const before = await snapshot(), keepId = before.clips[0];
    await page.evaluate(async keepId => { const { learningStore } = await import('/src/lib/learningStore.js'); await learningStore.put('attempts', { id: 'earlier-saved-fixture', answers: [{ recordingId: keepId }] }); }, keepId);
    await button('Exit without saving').click(); await page.waitForURL('**/exam'); await page.reload();
    const after = await snapshot(); assert.equal(after.drafts.length, 0); assert.deepEqual(after.clips, [keepId]); assert.equal(after.attempts.length, 1);
  });
  await test('discard during recording stops tracks and cannot resurrect a draft after callbacks settle', async () => {
    await start('ielts-part1-study-v1'); await button('Record answer').click(); await button('Stop recording').waitFor(); await page.waitForTimeout(1300);
    await button('Exit without saving').click(); await page.waitForURL('**/exam'); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
    const after = await snapshot(); assert.equal(after.drafts.length, 0); assert.equal(after.clips.length, 1); assert.equal(after.attempts.length, 1);
  });
  await test('seven-question review has its own group heading and separate per-sentence word reviews', async () => {
    await start();
    for (let index = 0; index < 7; index++) { await record(index); await button(index === 6 ? 'Finish and get feedback' : 'Next Question').click(); }
    await page.waitForURL('**/practice/review?id=*');
    await page.getByRole('heading', { name: '7 answers · group review' }).waitFor();
    await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
    await page.locator('#review-practiced > details > summary').click();
    assert.equal(await page.locator('.review-differences > summary').count(), 7);
    assert.equal(await page.getByText('Average level', { exact: true }).first().isVisible(), false);
    await page.screenshot({ path: `${output}/group-review.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/group-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
  });
  await test('exam mode has discard but does not reveal coaching, reference or retries mid-exam', async () => {
    await start(task.id, 'exam'); await button('Play sentence').click(); await button('Stop recording').waitFor(); await page.waitForTimeout(700); await button('Stop recording').click();
    await button('Next Question').waitFor();
    assert.equal(await button('Review this answer').count(), 0); assert.equal(await button('Try again').count(), 0);
    assert.equal(await page.getByLabel('Word and phrase review').count(), 0); assert.equal(await page.getByText('Reveal reference sentence', { exact: true }).count(), 0);
    await button('Exit without saving').click(); await page.waitForURL('**/exam');
  });
  await test('full mock in practice mode pauses after an answer so it can be reviewed or retried', async () => {
    await start('toefl-mock-campus-v1'); await button('Stop recording').waitFor(); await page.waitForTimeout(700); await button('Stop recording').click();
    await button('Review this answer').waitFor(); await button('Try again').waitFor(); await page.getByText('Question 1 / 11', { exact: true }).waitFor();
    await button('Exit without saving').click(); await page.waitForURL('**/exam');
  });
  assert.deepEqual(report.errors, []); report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; report.visibleState = await page.locator('body').innerText(); await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); process.exitCode = 1; }
finally { await fs.writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
