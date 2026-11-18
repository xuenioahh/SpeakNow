import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { IELTS_QUESTION_SETS, QUESTION_SETS, getBankTask, examPath } from '../../shared/questionBank.js';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=/private/tmp/speaknow-asr-check.wav'] });
const page = await browser.newPage();
page.setDefaultTimeout(100000);
const report = { scope: 'Real academic UI, MediaRecorder and local ASR; synthesized microphone audio, not human device acceptance', passed: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
await page.addInitScript(() => { window.SpeechRecognition = class { constructor() { throw new Error('Native recognition must not run while local ASR is available'); } }; });
try {
  for (const [name, set] of [['IELTS', IELTS_QUESTION_SETS.find(value => value.taskType === 'ielts-part1')], ['TOEFL', QUESTION_SETS.find(value => value.taskType === 'interview')]]) {
    assert.ok(set, name);
    await page.goto('http://localhost:5173' + examPath(getBankTask(set.setId), { questionIndex: 0 }));
    await page.getByRole('radio', { name: /^Practice / }).check();
    await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
    await page.waitForTimeout(5500);
    const transcription = page.waitForResponse(response => response.url().endsWith('/api/local-transcription'));
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    const response = await transcription;
    const result = await response.json(); assert.equal(response.status(), 200, JSON.stringify(result));
    await page.waitForFunction(() => document.querySelector('textarea')?.value.toLowerCase().includes('cup of tea'));
    const transcript = await page.getByRole('textbox', { name: 'Your transcript', exact: true }).inputValue();
    assert.match(transcript, /cup of tea/i);
    report.passed.push({ name, transcript, processingMs: result.processingMs });
  }
  assert.deepEqual(report.errors, []); report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error.message; report.visibleState = await page.locator('body').innerText(); process.exitCode = 1; }
finally { await fs.writeFile('docs/industrial-audit-2026-11-10/academic-asr-browser.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
