// Task 01 only. Browser API fixtures + real WebGL; does not use physical mic/TTS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173';
const engine = process.env.SPEAKNOW_BROWSER === 'webkit' ? webkit : chromium;
const query = '/voice/chat?scenario=cafe&mode=beginner&dialogMode=goal_oriented&scoring=ielts';
const output = process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-task01';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await engine.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__micMode = 'allow'; window.__streams = []; window.__speechQueue = []; window.__captureCount = 0; window.__uniforms = {}; window.__draws = 0;
      if (window.WebGL2RenderingContext) {
        const proto = WebGL2RenderingContext.prototype;
        const names = new WeakMap();
        const location = proto.getUniformLocation, uniform = proto.uniform1f, draw = proto.drawElements;
        proto.getUniformLocation = function(program, name) { const result = location.call(this, program, name); if (result) names.set(result, name); return result; };
        proto.uniform1f = function(location, value) { const name = names.get(location); if (name) window.__uniforms[name] = value; return uniform.call(this, location, value); };
        proto.drawElements = function(...args) { window.__draws++; return draw.apply(this, args); };
      }
      window.SpeechRecognition = class {
        start(track) { this.track = track; window.__recognition = this; queueMicrotask(() => this.onstart?.()); }
        stop() { this.onend?.(); }
      };
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
        speak: utterance => window.__speechQueue.push(utterance), cancel() {}, resume() {},
      } });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        window.__captureCount++;
        if (window.__micMode === 'deny') throw new DOMException('Blocked', 'NotAllowedError');
        const audio = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audio.createOscillator(), gain = audio.createGain(), output = audio.createMediaStreamDestination();
        gain.gain.value = 0.1; oscillator.frequency.value = 180;
        oscillator.connect(gain); gain.connect(output); oscillator.start(); await audio.resume();
        window.__streams.push(output.stream); window.__inputGain = gain;
        return output.stream;
      } });
    });
    await context.route('**/api/local-data', route => route.fulfill({ json: { ok: true, data: { id: 'orb-test', full_name: 'Orb Learner', role: 'user' } } }));
    await context.route('**/api/admin-track', route => route.fulfill({ json: { ok: true, data: {} } }));
    await context.route('**/api/voice-chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({ json: { source: 'ai', reply: 'Thank you. Which drink would you like?', feedback: { grammar: 'Clear sentence.' } } });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + query); await page.locator('.voice-orb canvas').waitFor();
    await page.waitForFunction(() => '__uniforms' in window && window.__uniforms.uTime !== undefined);
    assert.equal(await page.locator('.voice-orb').getAttribute('data-renderer'), 'webgl');
    await page.waitForFunction(() => window.__speechQueue.length > 0);
    assert.equal(await page.locator('.room-status').getAttribute('data-state'), 'idle');
    await page.evaluate(() => window.__speechQueue[0].onstart());
    await page.locator('.room-status[data-state=speaking]').waitFor();
    assert.equal(await page.evaluate(() => window.__uniforms.uEnergy || 0), 0, 'No invented AI amplitude');
    await page.evaluate(() => window.__speechQueue[0].onend());
    await page.locator('.room-status[data-state=idle]').waitFor();
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=listening]').waitFor();
    const shared = await page.evaluate(() => Boolean(window.__recognition.track));
    if (shared) {
      await page.waitForFunction(() => window.__uniforms.uEnergy > 0.08);
      assert.equal(await page.evaluate(() => window.__captureCount), 1);
      assert(await page.evaluate(() => window.__recognition.track === window.__streams[0].getAudioTracks()[0]));
      await page.evaluate(() => { window.__inputGain.gain.value = 0; });
      await page.waitForFunction(() => window.__uniforms.uEnergy < 0.005);
      await page.evaluate(() => window.__recognition.onend());
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__captureCount), 1, 'Restart shares the live capture');
      console.log('PASS: oscillator RMS drives actual GPU uEnergy, silence releases smoothly, one shared capture');
    } else {
      assert(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
      console.log('PASS: native recognition fallback releases the permission stream and uses no parallel meter');
    }
    await page.screenshot({ path: path.join(output, 'room-desktop.png') });
    await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
    assert(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    await page.getByRole('textbox', { name: 'Your reply' }).fill('I would like a latte because I enjoy coffee with milk.');
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.locator('.room-status[data-state=processing]').waitFor();
    await page.getByText('Thank you. Which drink would you like?', { exact: true }).waitFor();
    await page.locator('.room-status[data-state=idle]').waitFor();
    assert.equal(await page.locator('.room-status[data-state=completed]').count(), 0, 'Reply arrival is not practice completion');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const mic = page.getByRole('button', { name: 'Start recording', exact: true }); await mic.scrollIntoViewIfNeeded();
      assert(await mic.evaluate(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
      await page.screenshot({ path: path.join(output, `room-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('.voice-orb').scrollIntoViewIfNeeded();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
    const reducedDraws = await page.evaluate(() => window.__draws); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__draws), reducedDraws);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__micMode = 'deny');
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.locator('.room-status[data-state=error]').waitFor(); await page.waitForTimeout(100);
    const errorDraws = await page.evaluate(() => window.__draws); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__draws), errorDraws, 'Error stops nonessential animation');
    assert(await page.getByRole('textbox', { name: 'Your reply' }).isEnabled());
    await page.locator('.voice-orb canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.locator('.voice-orb[data-renderer=fallback]').waitFor();
    await page.getByRole('button', { name: 'End Practice and View Summary' }).click();
    await page.waitForURL('**/voice/report?**');
    assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('voiceMessages')).some(message => message.role === 'user')));
    await page.waitForTimeout(350); const exitedDraws = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(150); assert.equal(await page.evaluate(() => window.__draws), exitedDraws);
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
    });
    await page.goto(base + query); await page.locator('.voice-orb[data-renderer=fallback]').waitFor();
    assert(await page.getByRole('textbox', { name: 'Your reply' }).isEnabled());
    assert.deepEqual(errors, []);
    console.log('PASS: real WebGL + API-fixture conversation, truthful playback, permissions, mobile controls, reduced motion/error freeze, exit cleanup and WebGL fallback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
