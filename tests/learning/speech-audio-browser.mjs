import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IELTS_QUESTION_SETS, getBankTask, examPath } from '../../shared/questionBank.js';
import { encodeSpeechWav } from '../../shared/speechAudio.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const output = 'docs/speech-audio-2026-10-31'; await fs.mkdir(output, { recursive: true });
const captureFile = path.join(os.tmpdir(), `speaknow-audio-capture-${process.pid}.wav`);
await fs.writeFile(captureFile, encodeSpeechWav(Float32Array.from({ length: 64000 }, (_, i) => i > 16000 && i < 32000 ? 0 : Math.sin(i * 2 * Math.PI * 220 / 16000) * 0.2)));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${captureFile}`, '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1365, height: 950 } });
const page = await context.newPage(), origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5216';
const errors = [], passed = [];
page.setDefaultTimeout(18000); page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => {
  window.SpeechRecognition = class {
    start() { setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); const item = [{ transcript: 'I study engineering because I enjoy solving practical problems.' }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 30); }
    stop() { this.onaudioend?.(); setTimeout(() => this.onend?.(), 20); }
    abort() {}
  };
});
async function test(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
let id, recordingId;
try {
  const set = IELTS_QUESTION_SETS.find(set => set.taskType === 'ielts-part1');
  await test('real browser recording gets quality checks in IELTS bank practice and feedback', async () => {
    await page.goto(origin + examPath(getBankTask(set.setId), { questionIndex: 0 }));
    await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
    await page.waitForTimeout(2800);
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByRole('heading', { name: 'Recording quality', exact: true }).waitFor();
    await page.getByLabel('Recording quality results', { exact: true }).waitFor();
    assert.match(await page.getByLabel('Recording quality results').innerText(), /dBFS/);
    await page.getByRole('button', { name: 'Finish and get feedback', exact: true }).click();
    await page.waitForURL('**/practice/review?id=*');
    id = new URL(page.url()).searchParams.get('id');
    await page.getByRole('heading', { name: 'Speech & Recording Quality' }).waitFor();
    await page.getByLabel('Recording quality results').waitFor();
    await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
    await page.waitForFunction(async id => {
      const { learningStore } = await import('/src/lib/learningStore.js');
      const value = await learningStore.get('attempts', id);
      return value.feedback && Object.values(value.audioAssessments || {}).some(value => value.quality?.durationSeconds > 2);
    }, id);
    const saved = await page.evaluate(async id => (await import('/src/lib/learningStore.js')).learningStore.get('attempts', id), id);
    recordingId = saved.answers[0].recordingId;
    assert.equal(saved.audioAssessments[recordingId].pronunciation.status, 'not-configured');
    assert.equal(saved.audioAssessments[recordingId].pronunciation.accuracy, undefined);
    await page.screenshot({ path: `${output}/local-checks.png`, fullPage: true });
  });
  await test('assessment failure retains recording and text feedback; retry displays timestamped speech results', async () => {
    let calls = 0;
    await page.route('**/api/speaking-audio', async route => {
      const body = route.request().postDataJSON();
      if (body.action === 'status') return route.fulfill({ json: { configured: true, provider: 'azure-speech' } });
      calls++;
      assert.equal(body.recordingId, recordingId); assert.equal(body.attempt.id, id);
      assert.equal(body.attempt.audioAssessments, undefined);
      const bytes = Buffer.from(body.data, 'base64'); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.ok(bytes.length > 64000);
      if (calls === 1) return route.fulfill({ status: 503, json: { error: 'Controlled speech service outage.' } });
      return route.fulfill({ json: { recordingId, quality: { version: 1, source: 'recorded-audio', durationSeconds: 2.8, rmsDbfs: -18, clippedRatio: 0, quietSeconds: 1, pauseCount: 1, issues: [], limitation: 'Engineering fixture: audio response rendering only.' },
        pronunciation: { status: 'assessed', provider: 'azure-speech', accuracy: 82, fluency: 76, prosody: null, assessedSeconds: 2.1, durationSeconds: 2.8,
          recognizedText: 'Engineering fixture only.', aggregation: 'Engineering fixture, not a live provider measurement.', issues: [{ word: 'engineering', accuracy: 50, start: 0.7 }] } } });
    });
    await page.getByRole('button', { name: 'Check speech assessment', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Controlled speech service outage.' }).waitFor();
    await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry audio assessment', exact: true }).click();
    await page.getByText('82 / 100', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Replay engineering at 0.7 seconds', exact: true }).click();
    await page.locator('#review-practiced audio').waitFor();
    await page.waitForFunction(() => document.querySelector('#review-practiced audio')?.currentTime > 0.2);
    assert.equal(calls, 2);
    await page.reload();
    await page.getByText('82 / 100', { exact: true }).waitFor();
    assert.equal(calls, 2, 'reload reuses saved assessment');
    await page.screenshot({ path: `${output}/speech-result-fixture.png`, fullPage: true });
  });
  await test('speech feedback fits a narrow screen and remains separate from typed feedback', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload(); await page.getByText('82 / 100', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  });
  await test('IELTS bank audio survives missing transcription and still receives recording checks', async () => {
    await page.unroute('**/api/speaking-audio');
    const second = set.questions.length > 1 ? 1 : 0;
    await page.goto(origin + examPath(getBankTask(set.setId), { questionIndex: second }));
    await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your transcript', exact: true }).fill('');
    await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
    await page.waitForURL('**/practice/review?id=*');
    await page.getByLabel('Recording quality results').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Get AI feedback', exact: true }).count(), 0);
    await page.reload(); await page.getByLabel('Recording quality results').waitFor();
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify({ passed, errors, fixture: 'Real MediaRecorder and audio decoding; controlled ASR, text model and speech provider responses. No live pronunciation service key configured.' }, null, 2));
} finally { await browser.close(); await fs.unlink(captureFile).catch(() => {}); }
