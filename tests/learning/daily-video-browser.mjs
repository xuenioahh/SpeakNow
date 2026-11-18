import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');

// Controlled landmarks exercise the media, timestamp, persistence and playback
// path. They do not claim that the fake Chrome camera contains a human face.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1365, height: 900 } });
const page = await context.newPage();
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5194';
await page.route('**/api/voice-chat', route => {
  const action = route.request().postDataJSON()?.action;
  if (action === 'conversation_analysis') return route.fulfill({ json: { feedback: { task: '', grammar: '', vocabulary: '', pronunciation: '' } } });
  const reply = 'Engineering fixture: would you like a small or large coffee?';
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: ${JSON.stringify({ reply, source: 'ai', provider: 'fixture', model: 'controlled-browser-test' })}\n\n` });
});
try {
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) { if (!String(url).includes('expression-worker')) return new NativeWorker(url, options); this.closed = false; }
      postMessage(data) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 10);
        if (data.type === 'frame') {
          data.frame.close();
          const sample = { type: 'sample', time: data.time, faceX: .12, faceY: .5, head: .24, posture: .06,
            leftHand: .2 + Math.sin(data.time * 3) * .08, rightHand: .3 + Math.cos(data.time * 3) * .08,
            hands: .25 + Math.sin(data.time * 3) * .07 };
          setTimeout(() => { if (!this.closed) this.onmessage?.({ data: sample }); }, 4);
        }
      }
      terminate() { this.closed = true; }
    };
    class Recognition {
      start() { setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); const item = [{ transcript: 'I would like an oat milk latte please.' }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 40); }
      stop() { this.onaudioend?.(); setTimeout(() => this.onend?.(), 30); }
      abort() {}
    }
    window.SpeechRecognition = Recognition;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'en-US', name: 'Fixture' }], addEventListener() {}, resume() {}, cancel() {},
      speak(utterance) { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 50); },
    } });
  });
  await page.goto(`${origin}/voice/prepare?scenario=cafe`, { waitUntil: 'domcontentloaded' });
  await page.locator('.scenario-canvas canvas').waitFor({ timeout: 15000 });
  await page.getByText('Camera options', { exact: true }).click();
  await page.getByLabel('Camera preview', { exact: true }).check();
  await page.getByLabel('Analyze visible movement on this device').check();
  await page.getByLabel('Save a local 5–10 second video moment with microphone audio').check();
  await page.getByRole('button', { name: 'Start Conversation' }).click();
  await page.locator('.camera-preview video').waitFor();
  await page.waitForFunction(() => document.querySelector('.camera-preview video')?.srcObject?.getAudioTracks().some(track => track.readyState === 'live'));
  await page.getByRole('button', { name: 'Pause conversation' }).waitFor();
  // CameraPreview buffers the current eight-second MediaRecorder window in memory.
  await page.waitForTimeout(10000);
  await page.getByRole('button', { name: 'Finish & review' }).click();
  await page.waitForURL('**/practice/review?id=*');
  const clip = page.locator('video[aria-label="Your recorded practice moment"]');
  await page.getByRole('heading', { name: 'What You Practiced' }).waitFor();
  if (!(await clip.isVisible())) {
    const diagnostic = await page.evaluate(async () => {
      const { learningStore } = await import('/src/lib/learningStore.js');
      const id = new URL(location.href).searchParams.get('id');
      const attempt = await learningStore.get('attempts', id);
      const videos = (await learningStore.all('recordings')).filter(item => item.kind === 'local-video');
      return { id, answers: attempt?.answers, videoClip: attempt?.videoClip, visualWindows: attempt?.visualEvidence?.windows, vision: attempt?.visionTimeline, videos: videos.map(item => ({ id: item.id, duration: item.durationSeconds, size: item.blob?.size })), review: document.body.innerText.slice(-1800) };
    });
    console.log('CLIP DIAGNOSTIC', JSON.stringify(diagnostic));
  }
  await clip.waitFor({ timeout: 10000 });
  const metadata = await clip.evaluate(async video => {
    if (video.readyState < 1) await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, url: video.currentSrc };
  });
  assert.ok(metadata.duration >= 5 && metadata.duration <= 10, JSON.stringify(metadata));
  assert.ok(metadata.width > 0 && metadata.height > 0, JSON.stringify(metadata));
  assert.ok(metadata.url.startsWith('blob:'));
  assert.match(await page.locator('#video-moment').innerText(), /During this reply, your face was near the left edge/);
  assert.match(await page.locator('#video-moment').innerText(), /I would like an oat milk latte please/);
  await page.reload();
  await page.locator('video[aria-label="Your recorded practice moment"]').waitFor();
  console.log('PASS Daily Speaking audio-video clip: recorded media, 5–10s metadata, timed transcript, evidence, IndexedDB reload (controlled landmarks)');
} finally {
  await Promise.race([page.goto('about:blank').catch(() => {}), new Promise(resolve => setTimeout(resolve, 2500))]);
  await Promise.race([context.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2500))]);
  await Promise.race([browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2500))]);
}
process.exit(0);
