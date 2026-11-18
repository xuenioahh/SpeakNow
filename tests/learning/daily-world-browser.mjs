import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5228';
const output = 'docs/daily-world-2026-10-25';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
await context.addInitScript(() => {
  window.__streams = [];
  const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async constraints => { const stream = await getMedia(constraints); window.__streams.push(stream); return stream; };
  // Controlled recognition and synthesis events exercise actual capture,
  // persistence and browser media APIs. Native TTS is verified separately.
  class Recognition { start() { setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); const item = [{ transcript: 'Could you please check the oat milk in my drink?' }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 50); } stop() { this.onaudioend?.(); setTimeout(() => this.onend?.(), 30); } abort() {} }
  window.SpeechRecognition = Recognition;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  let current, timer;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [{ lang: 'en-US', name: 'Contract fixture' }], addEventListener() {}, resume() {},
    cancel() { clearTimeout(timer); current = null; },
    speak(utterance) { current = utterance; utterance.onstart?.(); timer = setTimeout(() => { if (current === utterance) { utterance.onend?.(); current = null; } }, 900); },
  } });
});
const page = await context.newPage();
const errors = [], performance = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.locator('.scenario-canvas').evaluate(node => node.__scene.snapshot());
const settled = () => page.waitForFunction(() => document.querySelector('.scenario-canvas')?.__scene && !document.querySelector('.scenario-canvas').__scene.snapshot().transitioning, { timeout: 15000 });
try {
  if (process.argv.includes('--matrix')) for (const scene of ['cafe','airport','bank','hotel','restaurant','shopping','hospital','university','office','phone','car_rental','museum']) {
    await page.goto(`${origin}/voice/prepare?scenario=${scene}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.scenario-canvas canvas').waitFor(); await settled();
    const canvas = await page.locator('.scenario-canvas canvas').elementHandle();
    const initial = await snapshot(), cameras = [];
    assert.equal(initial.npc.length, 3);
    for (const actor of initial.npc) { assert.equal(actor.bones, 17); assert.ok(actor.bounds[2] > .2); assert.ok(actor.bounds[1] > 1.2); }
    const options = await page.locator('#conversation-choice option').evaluateAll(nodes => nodes.map(node => ({ id: node.value, title: node.textContent })));
    for (const [index, option] of options.entries()) {
      await page.locator('#conversation-choice').selectOption(option.id); await settled();
      await page.locator('#conversation-choice').selectOption(option.id);
      await page.waitForFunction(()=>!document.querySelector('.daily-guidance-overlay>.primary').disabled);
      await settled();
      const value = await snapshot();
      assert.equal(value.npc.find(actor=>actor.id===option.id).faceVisible,true,`${scene}/${option.id}: current NPC face must be unobstructed`);
      assert.equal(value.focusedId, option.id); assert.equal(value.roomId, initial.roomId);
      assert.deepEqual(value.npc.map(actor => actor.uuid), initial.npc.map(actor => actor.uuid));
      assert.deepEqual(value.npc.map(actor => actor.position), initial.npc.map(actor => actor.position));
      assert.ok(await canvas.evaluate(node => node.isConnected));
      cameras.push(value.cameraPosition.map(v => v.toFixed(1)).join(','));
      await page.screenshot({ path: `${output}/after-${scene}-${index + 1}.png` });
      performance.push({ scene, cue: option.id, ...value });
    }
    assert.equal(new Set(cameras).size, 3);
    checks.push(`${scene}: 3 fixed actors, distinct cameras, same canvas and room`);
  }
  await page.goto(`${origin}/voice/prepare?scenario=cafe&cue=coffee`, { waitUntil: 'domcontentloaded' }); await settled();
  const registered = await page.evaluate(async () => (await fetch('/api/local-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',email:`daily-world-${Date.now()}@example.invalid`,full_name:'Daily World Test',password:'controlled-test-password'})})).json());
  assert.ok(registered.ok); await page.reload({waitUntil:'domcontentloaded'}); await settled();
  const canvas = await page.locator('.scenario-canvas canvas').elementHandle(), before = await snapshot();
  await page.locator('.scenario-canvas').focus(); await page.keyboard.press('ArrowRight'); await settled();
  await page.keyboard.press('Home'); await settled(); assert.equal((await snapshot()).focusedId,'coffee');
  await page.getByText('Camera options', { exact: true }).click(); await page.getByLabel('Camera preview', { exact: true }).check();
  await page.getByRole('button', { name: 'Start Conversation', exact: true }).click();
  await page.waitForURL('**stage=conversation*');
  assert.ok(await canvas.evaluate(node => node.isConnected)); assert.equal((await snapshot()).roomId, before.roomId);
  await page.locator('[data-interaction-state=speaking]').waitFor();
  await page.getByRole('button',{name:'Stop voice',exact:true}).click();
  await page.locator('[data-interaction-state=idle]').waitFor();
  await page.getByRole('button',{name:'Play audio',exact:true}).click();
  await page.locator('[data-interaction-state=speaking]').waitFor();
  await page.locator('.spatial-dialogue:not(.is-inactive)').waitFor();
  assert.ok((await page.getByLabel('NPC subtitles').innerText()).includes('Sam'));
  await page.screenshot({ path: `${output}/conversation-desktop.png` });
  await page.locator('.camera-preview video').waitFor();
  let releaseAnalysis;
  await page.route('**/api/speaking-feedback',async route=>{if(route.request().postDataJSON()?.action==='conversation_analysis'){await new Promise(resolve=>{releaseAnalysis=resolve;});return route.fulfill({json:{feedback:{task:'Fixture analysis arrived later.',grammar:'',vocabulary:''}}});}return route.continue();});
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.locator('[data-interaction-state=listening]').waitFor();
  assert.equal(await page.evaluate(() => window.speechSynthesis.speaking || false), false);
  await page.waitForTimeout(1400); await page.getByRole('button', { name: 'Stop recording and send' }).click();
  await page.waitForFunction(() => document.querySelector('.daily-transcript-history') || document.querySelector('.spatial-dialogue')?.textContent.includes('Fixture reply'));
  assert.equal(typeof releaseAnalysis,'function','analysis is still pending when NPC reply arrives');releaseAnalysis();
  await page.getByRole('button',{name:'Show',exact:true}).click();await page.getByText('Fixture analysis arrived later.',{exact:true}).waitFor();
  await page.unroute('**/api/speaking-feedback');await page.getByRole('button',{name:'Hide',exact:true}).click();
  for (const text of ['The cup says dairy but I asked for oat milk.', 'Could you label the replacement separately?']) {
    await page.getByLabel('Your reply', { exact: true }).fill(text); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.waitForFunction(t => document.querySelector('.spatial-dialogue')?.textContent.includes(t.slice(0, 35)), text);
  }
  assert.ok(await canvas.evaluate(node => node.isConnected));
  await page.getByLabel('Subtitle mode').selectOption('bottom'); await page.getByRole('region', { name: 'NPC subtitles' }).waitFor();
  await page.getByLabel('Subtitle mode').selectOption('hidden'); assert.equal(await page.locator('.spatial-dialogue').isVisible(), false);
  await page.getByLabel('Subtitle mode').selectOption('world');
  await page.getByRole('button', { name: /Camera on.*turn off/ }).click();
  await page.waitForFunction(() => window.__streams.every(stream => stream.getVideoTracks().every(track => track.readyState === 'ended')));
  await page.route('**/api/speaking-feedback', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Controlled outage; your reply is kept.'})}));
  await page.getByLabel('Your reply', {exact:true}).fill('Could we confirm the milk label once more?');
  await page.getByRole('button',{name:'Send reply',exact:true}).click(); await page.getByRole('button',{name:'Retry this request'}).waitFor();
  assert.match(await page.locator('[role=alert]').innerText(), /Controlled outage/);
  await page.unroute('**/api/speaking-feedback'); await page.getByRole('button',{name:'Retry this request'}).click();
  await page.waitForFunction(()=>document.querySelector('.spatial-dialogue')?.textContent.includes('milk label once more'));
  await page.getByRole('button', { name: 'Finish & review' }).click(); await page.waitForURL('**/practice/review?id=*');
  await page.locator('audio').first().waitFor();
  assert.ok(await page.locator('audio').first().evaluate(async audio => { await audio.play(); await new Promise(resolve=>setTimeout(resolve,300)); const playing=audio.currentTime>0; audio.pause(); return playing; }));
  const firstAttemptId=new URL(page.url()).searchParams.get('id');
  await page.getByRole('button', { name: 'Retry this conversation', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('retry'),firstAttemptId);
  assert.equal(new URL(page.url()).searchParams.get('cue'), 'coffee'); await settled(); assert.equal((await snapshot()).focusedId, 'coffee');
  await page.getByLabel('Your reply',{exact:true}).fill('Please label this oat milk drink separately.'); await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.spatial-dialogue')?.textContent.includes('label this oat milk'));
  await page.getByRole('button',{name:'Finish & review'}).click(); await page.waitForURL('**/practice/review?id=*');
  const secondAttemptId=new URL(page.url()).searchParams.get('id'); assert.notEqual(secondAttemptId,firstAttemptId);
  const savedRetry=await page.evaluate(async id=>{const {learningStore}=await import('/src/lib/learningStore.js'); const attempt=await learningStore.get('attempts',id);return {parentId:attempt.parentId,context:attempt.context};},secondAttemptId);
  assert.equal(savedRetry.parentId,firstAttemptId);assert.equal(savedRetry.context.cue,'coffee');
  checks.push('3 contextual fixture rounds, actual fake-device recording saved and replayable, interruption, camera cleanup, subtitles modes, feedback and linked retry');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${origin}/voice/prepare?scenario=cafe&cue=pastry`, { waitUntil: 'domcontentloaded' }); await settled();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `${output}/mobile-ready.png` });
  await page.getByRole('button', { name: 'Start Conversation', exact: true }).click(); await page.locator('[data-interaction-state=speaking]').waitFor();
  assert.ok(await page.evaluate(() => { const a=document.querySelector('.spatial-dialogue').getBoundingClientRect(),b=document.querySelector('.daily-live-panel').getBoundingClientRect();return a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right; }), 'mobile metrics must not cover NPC subtitles');
  await page.screenshot({ path: `${output}/mobile-conversation.png` });
  await page.getByRole('button',{name:'Camera off · enable preview',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.camera-preview video')?.srcObject?.getVideoTracks().some(track=>track.readyState==='live'));
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  assert.ok(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${origin}/voice/prepare?scenario=museum`, { waitUntil: 'domcontentloaded' }); await settled();
  assert.equal((await snapshot()).reducedMotion, true); const frames = (await snapshot()).frames; await page.waitForTimeout(1200); assert.ok((await snapshot()).frames - frames <= 1);
  checks.push('390px mobile layout and interaction; reduced-motion renders on demand; exit media cleanup');
  const logs=(await fs.readFile(`${output}/fixture-requests.jsonl`,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const dialogueLogs=logs.filter(log=>log.system.includes('Conversation ID: coffee')); assert.ok(dialogueLogs.length>=4); for(const log of dialogueLogs) assert.match(log.system,/Pickup counter/);
  assert.ok(dialogueLogs.some(log=>log.input.includes('cup says dairy')));
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/${process.argv.includes('--matrix') ? 'browser-results' : 'session-results'}.json`, JSON.stringify({ checks, errors, performance }, null, 2));
  console.log('PASS', checks);
} catch (error) { console.log('FAIL',page.url(),(await page.locator('body').innerText()).slice(0,2500)); await page.screenshot({path:`${output}/failure.png`}); await fs.writeFile(`${output}/browser-partial.json`,JSON.stringify({checks,errors,performance,error:error.message},null,2)); throw error; } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 4000))]); }
process.exit(0);
