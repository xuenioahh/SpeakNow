import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { IELTS_QUESTION_SETS, QUESTION_SETS, getBankTask, examPath } from '../../shared/questionBank.js';
import { getSpeakingTask } from '../../shared/speakingTasks.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const output = process.env.SPEAKNOW_TEST_OUTPUT || 'docs/full-product-2026-10-31'; await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1365, height: 950 }, colorScheme: 'dark' });
const page = await context.newPage(), origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5218';
const passed = [], errors = []; page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => {
  const NativeAudioContext = window.AudioContext;
  window.__streams = []; window.__recognitions = 0; window.__ttsActive = false; window.__overlap = 0;
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.__denyMic) throw Object.assign(new Error('Blocked by test'), { name: 'NotAllowedError' });
    if (window.__ttsActive) window.__overlap++;
    const audio = new NativeAudioContext(); await audio.resume();
    const source = audio.createOscillator(), gain = audio.createGain(), destination = audio.createMediaStreamDestination();
    source.connect(gain); gain.connect(destination); gain.gain.value = .18; source.start(); gain.gain.setValueAtTime(0, audio.currentTime + 2);
    const track = destination.stream.getAudioTracks()[0], stop = track.stop.bind(track); track.stop = () => { stop(); source.stop(); void audio.close(); };
    window.__streams.push(destination.stream); return destination.stream;
  };
  window.SpeechRecognition = class {
    start() { window.__recognitions++; this.timer = setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); const item = [{ transcript: 'I prefer studying in the morning because the library is quiet. I completed my project there last week.' }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 40); }
    stop() { clearTimeout(this.timer); this.onaudioend?.(); setTimeout(() => this.onend?.(), 20); }
    abort() { clearTimeout(this.timer); }
  };
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Fixture voice' }], addEventListener() {}, resume() {}, cancel() { window.__ttsActive = false; }, speak(utterance) { window.__spoken = utterance.text; window.__ttsActive = true; utterance.onstart?.(); setTimeout(() => { window.__ttsActive = false; utterance.onend?.(); }, 80); } } });
});
async function test(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
const light = async (target = page) => {
  assert.equal(await target.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.ok(await target.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).every(value => Number(value) > 200)));
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
};
async function start(set, index = 0, mode = 'practice') {
  await page.goto(origin + examPath(getBankTask(set.setId), { questionIndex: index }));
  await page.getByRole('radio', { name: mode === 'exam' ? /^Exam / : /^Practice / }).check();
  await page.getByRole('button', { name: mode === 'exam' ? 'Start Exam' : 'Start Practice', exact: true }).click();
  await page.locator('.exam-question').waitFor();
}
async function record() {
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor(); await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('button', { name: /^(Finish and get feedback|Finish practice|Submit exam)$/ }).waitFor();
}
async function finished(button = 'Finish and get feedback') {
  await page.getByRole('button', { name: button, exact: true }).click(); await page.waitForURL('**/practice/review?id=*');
  await page.locator('.ielts-audio-feedback > summary').click();
  await page.getByText('View recording and speech details', { exact: true }).click();
  await page.getByLabel('Recording quality results', { exact: true }).first().waitFor();
}
const repeat = QUESTION_SETS.find(set => set.taskType === 'repeat');
let savedPracticeId, accountId, accountEmail;
if (process.argv.includes('--layout-only')) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/membership'); await page.getByRole('heading', { name: 'Membership', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Your monthly practice' }).waitFor();
  console.log(JSON.stringify(await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length, scrollHeight: document.documentElement.scrollHeight, viewport: innerHeight, body: getComputedStyle(document.body).cssText, mainHeight: document.querySelector('main').getBoundingClientRect().height, routeTransform: getComputedStyle(document.querySelector('.route-stage')).transform }))));
  await page.screenshot({ path: `${output}/membership-mobile-layout.png`, fullPage: true, animations: 'disabled' });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.screenshot({ path: `${output}/membership-mobile-scrolled.png`, animations: 'disabled' });
  console.log(JSON.stringify(await page.evaluate(() => ({ scrollY, headingTop: document.querySelector('h1').getBoundingClientRect().top, visibleText: document.elementFromPoint(180, 200)?.textContent?.slice(0, 100) }))));
  await browser.close(); process.exit(0);
}
try {
  await test('all primary routes stay light even when the operating system requests dark mode', async () => {
    for (const route of ['/', '/exam', '/exam/ielts', '/voice', '/progress', '/membership', '/auth']) {
      await page.goto(origin + route); await page.locator('#root').waitFor(); await page.waitForLoadState('domcontentloaded'); await light();
    }
  });
  await test('TOEFL practice never reveals the reference automatically and gets real audio checks', async () => {
    await start(repeat); const reference = repeat.questions[0].questionText;
    assert.ok(!(await page.locator('main').innerText()).includes(reference));
    await page.getByRole('button', { name: 'Play sentence', exact: true }).click(); await record();
    await page.locator('.recording-quality > summary').click(); await page.getByLabel('Recording quality results').waitFor();
    assert.ok(!(await page.locator('main').innerText()).includes(reference));
    await page.getByText('Reveal reference sentence', { exact: true }).click(); await page.getByText(reference, { exact: true }).waitFor();
    await page.getByText('Reveal reference sentence', { exact: true }).click();
    await page.route('**/api/speaking-feedback', route => route.fulfill({ status: 503, json: { error: 'Controlled feedback service outage.', retryable: true } }), { times: 1 });
    await finished(); await page.getByRole('alert').filter({ hasText: 'Controlled feedback service outage.' }).waitFor();
    savedPracticeId = new URL(page.url()).searchParams.get('id');
    await page.reload(); await page.getByRole('alert').filter({ hasText: 'Controlled feedback service outage.' }).waitFor();
    await page.getByRole('button', { name: 'Retry feedback', exact: true }).click();
    await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/toefl-feedback-light.png`, fullPage: true, animations: 'disabled' });
  });
  await test('TOEFL exam hides references and transcript editing until the answer is submitted', async () => {
    await start(repeat, 1, 'exam'); const reference = repeat.questions[1].questionText;
    await page.getByRole('button', { name: 'Play sentence', exact: true }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor(); await page.waitForTimeout(2200);
    assert.ok(!(await page.locator('main').innerText()).includes(reference));
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByRole('button', { name: 'Submit exam', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Your transcript' }).count(), 0);
    assert.equal(await page.getByText('Reveal reference sentence', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Listen again', exact: true }).count(), 0);
    assert.ok(!(await page.locator('main').innerText()).includes(reference));
    await page.screenshot({ path: `${output}/toefl-exam-hidden-reference.png`, fullPage: true, animations: 'disabled' });
    await finished('Submit exam');
    await page.locator('#review-practiced summary').first().click(); await page.getByText(reference, { exact: true }).waitFor();
    const value = await page.evaluate(async () => (await import('/src/lib/learningStore.js')).learningStore.get('attempts', new URLSearchParams(location.search).get('id')));
    assert.equal(value.sessionMode, 'exam');
  });
  await test('IELTS Parts 1, 2 and 3 retain preparation and get recording quality results', async () => {
    for (const part of ['part1', 'part2', 'part3']) {
      const set = IELTS_QUESTION_SETS.find(set => set.taskType === `ielts-${part}`); await start(set);
      if (part === 'part2') { await page.getByRole('button', { name: 'Start 1-minute preparation' }).click(); await page.getByRole('button', { name: 'Finish preparation early' }).click(); }
      await record(); await finished(); await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
      await light();
    }
    await page.screenshot({ path: `${output}/ielts-light.png`, fullPage: true, animations: 'disabled' });
  });
  await test('complete IELTS and TOEFL mocks retain every question, recording, feedback and retry link', async () => {
    for (const taskId of ['ielts-full-mock-demo-v1', 'toefl-mock-campus-v1']) {
      const task = getSpeakingTask(taskId);
      await page.goto(origin + examPath(task));
      await page.getByRole('radio', { name: /^Practice / }).check();
      await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
      for (const [index, step] of task.steps.entries()) {
        await page.getByText(`Question ${index + 1} / ${task.steps.length}`, { exact: true }).waitFor();
        if (step.preparationSeconds) {
          await page.getByRole('timer').filter({ hasText: 'Preparation' }).waitFor();
          await page.getByRole('button', { name: 'Finish preparation early', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
        await page.waitForTimeout(650);
        await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
        await page.getByRole('button', { name: index + 1 === task.steps.length ? 'Finish and get feedback' : 'Next Question', exact: true }).click();
      }
      await page.waitForURL('**/practice/review?id=*');
      await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
      const saved = await page.evaluate(async () => {
        const { learningStore } = await import('/src/lib/learningStore.js');
        const attempt = await learningStore.get('attempts', new URLSearchParams(location.search).get('id'));
        return { attempt, sizes: await Promise.all(attempt.answers.map(async answer => (await learningStore.get('recordings', answer.recordingId))?.blob?.size || 0)) };
      });
      assert.equal(saved.attempt.answers.length, task.steps.length);
      assert.equal(new Set(saved.attempt.answers.map(answer => answer.questionIndex)).size, task.steps.length);
      assert.equal(new Set(saved.attempt.answers.map(answer => answer.recordingId)).size, task.steps.length);
      assert.ok(saved.sizes.every(size => size > 0));
      if (task.exam === 'ielts') assert.deepEqual([...new Set(saved.attempt.answers.map(answer => answer.part))], [1, 2, 3]);
      await page.reload();
      await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Try the same task again', exact: true }).click();
      await page.getByRole('button', { name: 'Start Practice', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('retry'), saved.attempt.id);
    }
  });
  await test('daily voice automatically recovers a transient AI outage without duplicating the learner turn', async () => {
    let first = true;
    await page.route('**/api/speaking-feedback', async route => {
      if (route.request().postDataJSON().action === 'conversation_stream' && first) { first = false; return route.fulfill({ status: 503, json: { error: 'Controlled temporary outage.', retryable: true } }); }
      return route.continue();
    });
    await page.goto(origin + '/voice/prepare?scenario=cafe');
    await page.locator('.scenario-canvas canvas').waitFor(); await page.getByRole('button', { name: 'Start Conversation', exact: true }).click();
    assert.equal(await page.locator('.scenario-canvas').evaluate(element => element.__scene.snapshot().background), 'eef2f7');
    await page.waitForFunction(() => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).some(key => { const value = JSON.parse(localStorage.getItem(key)); return value.messages?.filter(message => message.role === 'ai').length >= 3; }), null, { timeout: 40000 });
    await page.getByRole('button', { name: 'Pause conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Practice details', exact: true }).click();
    await page.locator('.recording-check-note').waitFor(); await page.keyboard.press('Escape'); assert.equal(first, false);
    assert.equal(await page.evaluate(() => window.__overlap), 0);
    await light(); await page.screenshot({ path: `${output}/daily-light-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 }); await light(); await page.screenshot({ path: `${output}/daily-light-mobile.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1365, height: 950 });
    await page.getByRole('button', { name: 'Finish & review', exact: true }).click(); await page.waitForURL('**/practice/review?id=*');
    await page.locator('.ielts-audio-feedback > summary').click();
    await page.getByText('View recording and speech details', { exact: true }).click();
    await page.getByLabel('Recording quality results').first().waitFor();
    const value = await page.evaluate(async () => (await import('/src/lib/learningStore.js')).learningStore.get('attempts', new URLSearchParams(location.search).get('id')));
    assert.equal(value.track, 'daily'); assert.ok(value.answers.length >= 2);
    assert.equal(new Set(value.answers.map(answer => answer.turnId)).size, value.answers.length);
    assert.ok(value.answers.every(answer => answer.recordingId));
    await page.unroute('**/api/speaking-feedback');
  });
  await test('VIP trial is real, remains active on refresh and exposes all five allowances', async () => {
    accountEmail = `browser-${randomUUID()}@example.invalid`;
    const registered = await page.evaluate(async email => { const response = await fetch('/api/local-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email, full_name: 'VIP Browser Learner', password: 'browser-fixture-password' }) }); return response.json(); }, accountEmail);
    accountId = registered.data.id;
    await page.goto(origin + '/membership'); await page.getByRole('button', { name: 'Start 7-day VIP trial', exact: true }).click();
    await page.getByRole('heading', { name: 'VIP trial active', exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: 'VIP trial active', exact: true }).waitFor();
    assert.equal(await page.locator('.membership-usage progress').count(), 5);
    assert.equal(await page.getByRole('button', { name: 'Start 7-day VIP trial', exact: true }).count(), 0);
    await light(); await page.screenshot({ path: `${output}/membership-light-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 }); await light(); await page.screenshot({ path: `${output}/membership-light-mobile.png`, fullPage: true, animations: 'disabled' }); await page.setViewportSize({ width: 1365, height: 950 });
  });
  await test('administrator can revoke VIP, process a learner request and grant time-limited access', async () => {
    const adminContext = await browser.newContext({ viewport: { width: 1365, height: 950 } }), admin = await adminContext.newPage();
    await admin.goto(origin + '/auth');
    const registration = await admin.evaluate(async () => {
      const credentials = { email: 'speech-admin-fixture@example.invalid', full_name: 'Speech Admin Fixture', password: 'browser-admin-fixture-password' };
      const send = action => fetch('/api/local-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...credentials }) });
      let response = await send('register');
      if (response.status === 409) response = await send('login');
      if (!response.ok) throw new Error(`Fixture administrator sign-in failed (${response.status})`);
      return response.json();
    });
    assert.equal(registration.data.role, 'admin');
    await admin.goto(origin + '/admin');
    await admin.getByRole('button').filter({ hasText: accountEmail }).click();
    await admin.locator('.admin-membership').waitFor(); await admin.getByRole('button', { name: 'Return to Free', exact: true }).click();
    await admin.locator('.admin-membership').getByText('Free membership', { exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: 'Free membership', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Send VIP request', exact: true }).click(); await page.getByRole('button', { name: 'Request pending', exact: true }).waitFor();
    await admin.reload(); await admin.getByRole('button').filter({ hasText: accountEmail }).click();
    await admin.locator('.admin-membership').getByText(/Request: pending/).waitFor();
    await admin.getByRole('button', { name: 'Grant VIP access', exact: true }).click();
    await admin.locator('.admin-membership').getByText(/VIP until/).waitFor();
    await page.reload(); await page.getByRole('heading', { name: 'VIP active', exact: true }).waitFor();
    const status = await page.evaluate(async () => { const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('speaknow_csrf=')).split('=')[1]; return (await fetch('/api/membership', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ action: 'status' }) })).json(); });
    assert.equal(status.upgradeRequest.status, 'approved'); assert.equal(status.membership.origin, 'administrator');
    await adminContext.close();
  });
  await test('unavailable premium voice falls back to English browser speech and cancellation stays cancelled', async () => {
    await page.goto(origin + '/voice');
    const result = await page.evaluate(async () => {
      const { StableAudioManager } = await import('/src/lib/audioManager.js');
      const manager = new StableAudioManager(); manager._dynamicTtsMode = 'elevenlabs';
      let fallbacks = 0; manager.playAIVoice = async () => { fallbacks++; return true; };
      manager._playServerVoice = async () => false;
      const recovered = await manager.playDynamicVoice('A clear English reply.');
      manager._playServerVoice = () => new Promise(resolve => setTimeout(() => { manager.stop(); resolve(false); }, 10));
      const cancelled = await manager.playDynamicVoice('Do not restart after stopping.');
      const nonEnglish = manager._pickVoice([{ lang: 'zh-CN', name: 'Chinese voice' }], 'female');
      manager.stop(); return { recovered, cancelled, fallbacks, nonEnglish };
    });
    assert.deepEqual(result, { recovered: true, cancelled: false, fallbacks: 1, nonEnglish: null });
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify({ passed, errors, accountId, scope: 'Real WebAudio, MediaRecorder, PCM decoding, IndexedDB, API sessions, quotas and membership actions. Controlled ASR, TTS and LLM responses. Azure Speech not configured.' }, null, 2));
} catch (error) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-3000)); throw error; }
finally { await browser.close(); }
