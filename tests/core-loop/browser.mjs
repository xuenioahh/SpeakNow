import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5193';
const out = path.resolve(process.env.SPEAKNOW_TEST_ARTIFACTS || 'docs/core-value-2026-10-12/artifacts'); await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [], checks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['microphone', 'camera'] });
// External typography is unrelated to this flow and can stall navigation or
// screenshots when the font CDN is unreachable. PDF parsing remains real.
await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
await context.addInitScript(() => {
  window.__testTracks = [];
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => { const stream = await originalGetUserMedia(options); window.__testTracks.push(...stream.getTracks()); return stream; };
  window.SpeechRecognition = class {
    start() { window.__recognition = this; queueMicrotask(() => this.onstart?.()); }
    stop() { queueMicrotask(() => this.onend?.()); }
    abort() { this.onend?.(); }
  };
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const note = text => { checks.push(text); console.log(`PASS: ${text}`); };
async function prepare(topic = 'A university project presentation') {
  await page.goto(base + '/presentation');
  await page.getByLabel('Presentation Topic', { exact: true }).fill(topic);
  await page.getByLabel('Core Message', { exact: true }).fill('A small evaluation can test our proposal.');
  await page.getByLabel('Desired Outcome', { exact: true }).fill('Classmates understand the proposal and its limitations.');
}
async function speak(text, stopRecording = true) {
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).waitFor();
  await page.waitForTimeout(1100); // Real MediaRecorder needs media frames.
  await page.evaluate(text => {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    window.__recognition.onresult({ resultIndex: 0, results: [result] });
  }, text);
  if (stopRecording) await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
}
async function api(body, endpoint = '/api/presentation-practice') {
  return page.evaluate(async ({ body, endpoint }) => {
    const csrf = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('speaknow_csrf='))?.slice(14) || '';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  }, { body, endpoint });
}
try {
  await page.goto(base + '/auth');
  await page.getByRole('button', { name: /Need an account.*Register/i }).click();
  await page.getByLabel('Full name').fill('Engineering fixture');
  await page.getByLabel('Email').fill(`core-loop-${Date.now()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('engineering-test-password');
  await page.getByRole('button', { name: /^Create account$/i }).click();
  await page.waitForURL(base + '/');
  await page.getByText('Prepare your important presentations and improve the parts that matter.', { exact: true }).waitFor();
  note('new user authenticates through real backend; homepage explains the presentation task');
  await prepare(); await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('heading', { name: 'Your 5-minute English presentation', exact: true }).waitFor();
  assert.equal(await page.getByText('Could not load PDF', { exact: true }).count(), 0);
  const before = 'We propose a university project evaluation. Our solution will completely transform the industry.';
  await speak(before, false);
  // Exit and revisit through preparation, retaining the same text and recorded Blob.
  await page.getByRole('button', { name: 'Exit · keep draft', exact: true }).click();
  assert(await page.evaluate(() => window.__testTracks.every(track => track.readyState === 'ended')), 'exit releases live microphone tracks');
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.waitForFunction(text => document.querySelector('.impact-capture textarea')?.value === text, before);
  assert.equal(await page.locator('.impact-capture textarea').inputValue(), before);
  note('no attachment, generated recording, mid-session exit and re-entry restore unsent text and audio');
  // Let a real save/upload complete, then lose its response; retry must not duplicate either record.
  let saveLost = false;
  await page.route('**/api/presentation-practice', async route => {
    if (!saveLost && route.request().postDataJSON()?.action === 'save') { saveLost = true; await route.fetch(); await route.abort('failed'); } else await route.continue();
  });
  let mediaLost = false;
  await page.route('**/api/presentation-media', async route => {
    if (!mediaLost && route.request().postDataJSON()?.action === 'save') { mediaLost = true; await route.fetch(); await route.abort('failed'); } else await route.continue();
  });
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.getByText(/Your words and any recording remain on this device/i).waitFor();
  await page.reload();
  await page.waitForFunction(text => document.querySelector('.impact-capture textarea')?.value === text, before);
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.getByText(/recording upload is pending/i).waitFor();
  await page.reload();
  await page.getByText('Your 5-minute English presentation', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.impact-capture textarea')?.readOnly === true);
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*');
  await page.locator('.impact-moment.primary').waitFor();
  const originalId = new URL(page.url()).searchParams.get('session');
  const original = await api({ action: 'get', id: originalId });
  assert.equal(original.status, 200); assert.equal(original.value.session.report.impact.recordings.length, 1);
  assert.equal(original.value.session.report.impact.transcript, before);
  const savedRecords = await api({ action: 'listEntity', entity: 'PresentationSession' }, '/api/local-data');
  assert.equal(savedRecords.value.data.filter(record => record.report?.impact?.transcript === before).length, 1, 'lost save response must not create another original');
  assert((await page.locator('.impact-surgeon').innerText()).includes('AI Coaching Suggestion'));
  await page.locator('.impact-replay video').first().evaluate(async video => { await video.play(); video.pause(); });
  note('network response loss and reload recover one immutable saved practice/recording; feedback remains a suggestion');
  const retryText = 'We propose testing whether the project helps. The result is not yet established, and our next step is a small evaluation.';
  await page.locator('.impact-moment.primary').getByRole('button', { name: 'Practice This Moment', exact: true }).click();
  await page.getByRole('heading', { name: 'Retry one important moment', exact: true }).waitFor();
  await page.reload(); await page.getByRole('heading', { name: 'Retry one important moment', exact: true }).waitFor();
  await speak(retryText);
  await page.getByRole('button', { name: 'Finish & Compare', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*');
  await page.locator('.impact-comparison').getByText('Improved', { exact: true }).waitFor();
  assert((await page.locator('.impact-comparison').innerText()).includes('not confirmed learning improvement'));
  const retryId = new URL(page.url()).searchParams.get('session'); assert.notEqual(retryId, originalId);
  const unchanged = await api({ action: 'get', id: originalId }); assert.equal(unchanged.value.session.report.impact.transcript, before);
  const linked = await api({ action: 'linked', id: originalId }); assert.equal(linked.value.sessions.length, 1);
  assert.equal(linked.value.sessions[0].report.impact.transcript, retryText);
  note('feedback → attachment-free targeted retry → comparison; reload preserves target and original recording');
  await page.locator('.impact-comparison').getByRole('link', { name: 'Return to Original / Retry' }).click();
  await page.locator('.impact-moment.primary').waitFor();
  await page.screenshot({ path: path.join(out, 'core-feedback-desktop.png'), fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`);
  }
  note('original report re-entry and 320–1440px layouts remain usable');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prepare('Valid PDF presentation test');
  const pdf = new jsPDF(); pdf.text('Engineering fixture: explain a small project evaluation.', 20, 25);
  await page.locator('input[type=file]').setInputFiles({ name: 'valid-presentation.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer')) });
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('heading', { name: 'Your 5-minute English presentation', exact: true }).waitFor();
  await page.getByRole('img', { name: 'Page 1', exact: true }).waitFor({ timeout: 20000 });
  await speak(before);
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*'); await page.locator('.impact-moment.primary').waitFor();
  const fileRecord = await api({ action: 'get', id: new URL(page.url()).searchParams.get('session') });
  assert.equal(fileRecord.value.session.total_pages, 1); assert.equal(fileRecord.value.session.file_name, 'valid-presentation.pdf');
  note('valid PDF is rendered and its spoken attempt reaches saved feedback');
  // Invalid/unavailable attachments are optional; they never gate the speech loop.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prepare('Attachment recovery test');
  await page.locator('input[type=file]').setInputFiles({ name: 'unavailable.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nengineering invalid preview fixture') });
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**', route => route.abort());
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('heading', { name: 'Your 5-minute English presentation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue without slides', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Start Recording', exact: true }).count(), 1);
  await speak('NO_PRIORITY_TEST We propose checking the project carefully and explaining the limits of the available evidence.');
  let analysisFailed = false;
  await page.route('**/api/presentation-impact', async route => { if (!analysisFailed) { analysisFailed = true; await route.abort('failed'); } else await route.continue(); });
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*');
  await page.getByRole('button', { name: 'Retry Analysis', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry Analysis', exact: true }).click();
  await page.getByText(/No strong improvement priority identified/).waitFor();
  assert.equal(await page.locator('.impact-moment.primary').count(), 0);
  note('attachment failure, analysis network failure and explicit retry preserve speech; no forced primary issue');
  // Text fallback remains available, but is not treated as spoken learning evidence.
  await prepare('Text fallback test'); await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Use Text Mode', exact: true }).click();
  await page.locator('.impact-capture textarea').fill('This is typed practice text. It is not a recorded pronunciation measurement or evidence of spoken improvement.');
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*');
  await page.getByText(/Text fallback: this feedback evaluates your typed practice text/).waitFor();
  note('typed fallback is explicitly distinguished from spoken measurements');
  await page.screenshot({ path: path.join(out, 'core-feedback-text-source.png'), fullPage: true });
  await prepare('Recorder start recovery'); await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.evaluate(() => {
    const originalStart = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function(...args) {
      MediaRecorder.prototype.start = originalStart;
      throw new DOMException('Controlled recorder start failure', 'NotSupportedError');
    };
  });
  await speak('My transcript survives a recorder failure.');
  await page.getByText(/Audio replay is unavailable/).waitFor();
  await page.getByRole('button', { name: 'Exit · keep draft', exact: true }).click();
  await page.getByRole('button', { name: 'Start Practice', exact: true }).waitFor({ timeout: 5000 });
  assert(await page.evaluate(() => window.__testTracks.every(track => track.readyState === 'ended')));
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.impact-capture textarea')?.value === 'My transcript survives a recorder failure.');
  await speak(before);
  await page.getByRole('button', { name: 'Finish Presentation', exact: true }).click();
  await page.waitForURL('**/presentation/report?session=*');
  const recovered = await api({ action: 'get', id: new URL(page.url()).searchParams.get('session') });
  assert.equal(recovered.value.session.report.impact.recordings.length, 1);
  note('MediaRecorder.start failure preserves text, allows exit, releases tracks and supports a new saved recording');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ status: 'PASS engineering core loop', checks, browserErrors: errors, evidence: 'Actual HTTP authentication/storage, actual MediaRecorder with generated Chrome audio, controlled ASR, synthetic provider. NOT real user effectiveness or paid model validation.' }, null, 2));
} catch (error) {
  console.error('Core-loop failure:', error);
  console.log('Failure page:', await page.locator('body').innerText().catch(() => 'unavailable'));
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true, timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
