// Run against a local dev server. All API writes are intercepted; no real user data changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173';
const out = process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-spatial';
const engine = process.env.SPEAKNOW_BROWSER === 'webkit' ? webkit : chromium;
const query = '/voice/chat?scenario=cafe&mode=beginner&dialogMode=goal_oriented&scoring=ielts';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await engine.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], writes = [], created = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__micMode = 'allow'; window.__streams = []; window.__speechQueue = [];
      class Recognition {
        start() { window.__recognition = this; queueMicrotask(() => { this.onstart?.(); this.onaudiostart?.(); }); }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = Recognition;
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        if (window.__micMode === 'deny') throw new DOMException('Blocked', 'NotAllowedError');
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator(), gain = ctx.createGain(), output = ctx.createMediaStreamDestination();
        oscillator.frequency.value = 180; gain.gain.value = 0.08;
        oscillator.connect(gain); gain.connect(output); oscillator.start(); await ctx.resume();
        window.__streams.push(output.stream); window.__inputGain = gain;
        return output.stream;
      } });
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
        speak: utterance => { window.__speechQueue.push(utterance); }, cancel() {}, resume() {},
      } });
    });
    await context.route('**/api/local-data', async route => {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      const user = { id: 'spatial-test', full_name: 'Studio Learner', role: 'user' };
      let data = user;
      if (payload.action === 'listEntity') data = payload.entity === 'VoiceSession' ? created : [];
      if (payload.action === 'createEntity') {
        data = { ...payload.data, id: payload.entity === 'VoiceSession' ? 'saved-test-session' : `activity-${writes.length}`, created_date: new Date().toISOString() };
        if (payload.entity === 'VoiceSession') created.push(data);
      }
      await route.fulfill({ json: { ok: true, data } });
    });
    await context.route('**/api/admin-track', route => route.fulfill({ json: { ok: true, data: {} } }));
    await context.route('**/api/voice-chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.fulfill({ json: { source: 'ai', reply: 'That sounds good. What would you like to order next?', feedback: { grammar: 'Your meaning is clear.', vocabulary: 'Try one specific detail.' } } });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + query); await page.locator('.voice-orb canvas').waitFor();
    assert.equal(await page.locator('.voice-orb').getAttribute('data-renderer'), 'webgl');
    await page.waitForFunction(() => window.__speechQueue.length > 0);
    assert.equal(await page.locator('.room-status').getAttribute('data-state'), 'idle', 'queued audio cannot claim to be speaking');
    await page.evaluate(() => window.__speechQueue[0].onstart());
    await page.locator('.room-status[data-state=speaking]').waitFor();
    await page.evaluate(() => window.__speechQueue[0].onend());
    await page.locator('.room-status[data-state=idle]').waitFor();
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=listening]').waitFor();
    await page.screenshot({ path: path.join(out, 'room-desktop.png') });
    await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
    assert(await page.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
    await page.getByRole('textbox', { name: 'Your reply' }).fill('I would like a latte because I enjoy coffee with milk.');
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.locator('.room-status[data-state=processing]').waitFor();
    await page.getByText('That sounds good. What would you like to order next?', { exact: true }).waitFor();
    await page.evaluate(() => { const utterance = window.__speechQueue.at(-1); utterance.onstart?.(); utterance.onend?.(); });
    await page.locator('.room-status[data-state=idle]').waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
      await page.getByRole('button', { name: 'Start recording', exact: true }).scrollIntoViewIfNeeded();
      const hit = await page.getByRole('button', { name: 'Start recording', exact: true }).evaluate(el => {
        const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }); assert(hit, 'Canvas cannot block controls');
      await page.screenshot({ path: path.join(out, `room-mobile-${width}.png`) });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=listening]').waitFor();
    await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
    await page.evaluate(() => window.__micMode = 'deny');
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=error]').waitFor();
    assert(await page.getByRole('textbox', { name: 'Your reply' }).isEnabled());
    await page.locator('.voice-orb canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.locator('.voice-orb[data-renderer=fallback]').waitFor();
    await page.getByRole('button', { name: 'End Practice and View Summary' }).click();
    await page.locator('.feedback-summary').waitFor();
    await page.getByRole('button', { name: 'Save Summary', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.equal(created.length, 1); assert(created[0].messages.some(m => m.role === 'user'));
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('.speaking-room').waitFor();
    assert(page.url().includes('scenario=cafe'));
    await page.goto(`${base}/voice/history?session=saved-test-session`);
    await page.locator('#saved-session-saved-test-session .skill-radar').waitFor();
    assert.equal(await page.locator('.skill-dimensions button').count(), 0, 'text guidance must not invent measured scores');
    assert.equal(created[0].report.scoring_framework.score_available, false);
    await page.screenshot({ path: path.join(out, 'history.png') });
    await page.goto(`${base}/profile`); await page.locator('.practice-timeline a').first().waitFor();
    await page.locator('.practice-timeline a').first().click();
    await page.locator('#saved-session-saved-test-session .skill-radar').waitFor();
    await page.goto(`${base}/voice`);
    await page.getByRole('button', { name: 'Preview Airport', exact: true }).click();
    await page.getByLabel('Airport spatial preview', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start conversation', exact: false }).click();
    await page.getByRole('heading', { name: 'Choose Practice Mode' }).waitFor();
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
    });
    await page.goto(base + query); await page.locator('.voice-orb[data-renderer=fallback]').waitFor();
    assert(await page.getByRole('textbox', { name: 'Your reply' }).isEnabled());
    assert.deepEqual(errors, []);
    console.log(`PASS: states, real test-stream input, permissions, cleanup, API turn, saved report without invented scores, retry, history, scenario entry, mobile, reduced motion and WebGL loss/fallback. Artifacts: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
