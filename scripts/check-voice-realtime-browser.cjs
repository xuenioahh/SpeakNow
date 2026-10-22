// Real browser DOM/WebGL + controlled browser speech/network fixtures.
// Physical microphone, OS TTS and actual provider latency require manual checks.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], requests = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__captures = 0; window.__streams = []; window.__speechQueue = []; window.__deny = false;
      window.SpeechRecognition = class {
        start(track) { this.track = track; window.__recognition = this; queueMicrotask(() => { this.onstart?.(); this.onaudiostart?.(); }); }
        stop() { queueMicrotask(() => { this.onaudioend?.(); this.onend?.(); }); }
        abort() { this.onaudioend?.(); this.onend?.(); }
      };
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ name: 'Samantha', lang: 'en-US' }], resume() {}, cancel() {}, speak(utterance) { window.__speechQueue.push(utterance); } } });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        window.__captures++;
        if (window.__deny) throw new DOMException('Blocked', 'NotAllowedError');
        const audio = new AudioContext(), oscillator = audio.createOscillator(), gain = audio.createGain(), destination = audio.createMediaStreamDestination();
        gain.gain.value = 0.01; oscillator.connect(gain); gain.connect(destination); oscillator.start(); await audio.resume();
        window.__streams.push(destination.stream); return destination.stream;
      } });
    });
    await context.route('**/api/local-data', route => route.fulfill({ json: { ok: true, data: { id: 'realtime-fixture', full_name: 'Speaking Learner', role: 'user' } } }));
    await context.route('**/api/admin-track', route => route.fulfill({ json: { ok: true, data: {} } }));
    let failNext = false;
    await context.route('**/api/voice-chat', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      await new Promise(resolve => setTimeout(resolve, 180));
      if (failNext) { failNext = false; await route.abort('failed'); return; }
      await route.fulfill({ json: { source: 'ai', reply: `Coach response ${requests.length}.`, feedback: { grammar: 'Clear meaning.' } } });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/voice/chat?scenario=cafe&mode=beginner&dialogMode=goal_oriented&scoring=ielts`);
    await page.getByRole('textbox', { name: 'Your reply' }).waitFor();
    await page.waitForFunction(() => window.__speechQueue.length > 0);
    await page.evaluate(() => { const utterance = window.__speechQueue.at(-1); utterance.onstart(); utterance.onend(); });
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=listening]').waitFor();
    await page.evaluate(() => window.__recognition.onresult({ results: [{ isFinal: false, 0: { transcript: 'Still thinking about this answer' } }] }));
    await page.waitForTimeout(1000);
    assert.equal(requests.length, 0, 'interim subtitles never trigger auto-send');
    assert(await page.getByText('Still thinking about this answer', { exact: true }).isVisible());
    await page.evaluate(() => window.__recognition.onresult({ results: [{ isFinal: true, 0: { transcript: 'My complete first answer.' } }] }));
    await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
    await page.locator('.speaking-room[data-interaction-state=processing]').waitFor();
    await page.getByText('Coach response 1.', { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    await page.evaluate(() => window.__speechQueue.at(-1).onstart());
    await page.locator('.room-status[data-state=speaking]').waitFor();
    await page.evaluate(() => window.__speechQueue.at(-1).onend());
    await page.locator('.room-status[data-state=idle]').waitFor();
    for (let i = 2; i <= 5; i++) {
      await page.getByRole('textbox', { name: 'Your reply' }).fill(`Answer number ${i}.`);
      await page.getByRole('button', { name: 'Send reply', exact: true }).click();
      await page.getByText(`Coach response ${i}.`, { exact: true }).waitFor();
      await page.evaluate(() => { const utterance = window.__speechQueue.at(-1); utterance.onstart(); utterance.onend(); });
      await page.locator('.room-status[data-state=idle]').waitFor();
    }
    assert.equal(requests.length, 5);
    assert.equal(await page.locator('.studio-message[data-latest=true]').count(), 1);
    failNext = true;
    await page.getByRole('textbox', { name: 'Your reply' }).fill('Keep my answer if the request fails.');
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.locator('.room-status[data-state=error]').waitFor();
    await page.getByRole('button', { name: 'Retry this request', exact: true }).click();
    await page.getByText('Coach response 7.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Keep my answer if the request fails.', { exact: true }).count(), 1);
    await page.evaluate(() => { const utterance = window.__speechQueue.at(-1); utterance.onstart(); utterance.onend(); });
    await page.evaluate(() => window.__deny = true);
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=error]').waitFor();
    assert(await page.getByRole('textbox', { name: 'Your reply' }).isEnabled());
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page.waitForURL('**/voice');
    assert(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    assert.deepEqual(errors, []);
    console.log('PASS: actual browser fixture flow, interim/final captions, five rounds, playback/orb states, network retry, permissions, mobile layout and exit cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
