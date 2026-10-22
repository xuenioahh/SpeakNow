const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-immersive';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route('**/api/local-data', r => r.fulfill({ json: { ok: true, data: { id: 'scene-test', full_name: 'Scene Learner', role: 'user' } } }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173/voice');
    await page.locator('.scenario-canvas canvas').waitFor({ timeout: 15000 }).catch(async error => { console.log(await page.locator('body').innerText()); console.log(errors); await page.screenshot({ path: path.join(out, 'initial-failure.png') }); throw error; });
    await page.locator('.scenario-spotlight').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.scenario-stage-fallback').count(), 0);
    await page.locator('.scenario-spotlight').screenshot({ path: path.join(out, 'cafe-desktop.png') });
    const marker = page.locator('.scene-marker').first();
    const initialTransform = await marker.getAttribute('style');
    await page.getByRole('button', { name: 'Rotate scene right', exact: true }).click();
    await page.waitForTimeout(500);
    assert.notEqual(await marker.getAttribute('style'), initialTransform);
    await page.getByRole('button', { name: 'Reset scene view' }).click();
    await page.getByRole('button', { name: 'Explore Your coffee order', exact: true }).click();
    await page.getByText('Could you label the oat-milk latte and make all five to go?', { exact: false }).waitFor();
    assert.equal(await page.locator('.scene-topline > span').innerText(), '1 / 3 discovered');
    await page.getByRole('button', { name: 'Close object details' }).click();
    await page.getByRole('button', { name: 'Step inside', exact: true }).click();
    await page.waitForTimeout(900);
    await page.locator('.scenario-spotlight').screenshot({ path: path.join(out, 'cafe-inside.png') });
    await page.getByRole('button', { name: 'Switch to evening light' }).click();
    await page.waitForTimeout(200);
    await page.locator('.scenario-spotlight').screenshot({ path: path.join(out, 'cafe-evening.png') });
    await page.getByRole('button', { name: 'Expand scene' }).click();
    assert(await page.locator('.scene-viewport').evaluate(el => el.clientHeight >= 550));
    await page.getByRole('button', { name: 'Reduce scene' }).click();
    console.log('PASS: camera controls, object cues, inside view, lighting, and expansion');
    for (const title of ['Airport', 'Bank', 'Hotel', 'Restaurant', 'Shopping', 'Hospital', 'University', 'Office', 'Phone Call', 'Car Rental', 'Museum', 'Café']) {
      await page.getByRole('button', { name: `Preview ${title}`, exact: true }).click();
      await page.getByLabel(`${title} spatial preview`, { exact: true }).waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.scenario-stage-fallback').count(), 0, `${title} should render`);
      assert.equal(await page.locator('.scenario-canvas canvas').count(), 1);
      const cues = page.locator('.scene-cue-list button');
      assert.equal(await cues.count(), 3);
      for (let i = 0; i < 3; i++) {
        await cues.nth(i).click();
        assert(await page.locator('.scene-cue-detail blockquote').isVisible());
      }
      assert.equal(await page.locator('.scene-topline > span').innerText(), '3 / 3 discovered');
      await page.getByRole('button', { name: 'Close object details' }).click();
      await page.getByRole('button', { name: 'Reset scene view' }).click();
      await page.waitForTimeout(400);
      await page.locator('.immersive-stage').screenshot({ path: path.join(out, `${title.toLowerCase().replaceAll(' ', '-')}.png`) });
    }
    console.log('PASS: all 12 scenes and 36 task cues; exactly one live canvas after each switch');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Reset scene view' }).click();
    await page.waitForTimeout(150);
    const stableTransform = await marker.getAttribute('style');
    await page.waitForTimeout(300);
    assert.equal(await marker.getAttribute('style'), stableTransform);
    await page.locator('.scenario-canvas').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
    assert.notEqual(await marker.getAttribute('style'), stableTransform);
    await page.keyboard.press('Home');
    console.log('PASS: reduced motion is stable; keyboard moves and resets camera');
    for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('.scenario-spotlight').scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
      await page.locator('.scene-cue-list button').first().click();
      assert(await page.locator('.scene-cue-detail').isVisible());
      for (const control of await page.locator('.scene-tools button, .scenario-stage-controls button').all()) {
        const bounds = await control.boundingBox();
        assert(bounds.width >= 44 && bounds.height >= 44, `scene control touch area at ${width}px`);
      }
      await page.locator('.scenario-spotlight').screenshot({ path: path.join(out, `mobile-${width}.png`) });
      await page.getByRole('button', { name: 'Close object details' }).click();
    }
    console.log('PASS: 320–1920px layouts and cues');
    // Keep the touch regression on a phone viewport after the desktop checks.
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('.scenario-canvas').scrollIntoViewIfNeeded();
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const area = await page.locator('.scenario-canvas').boundingBox();
    const beforeTouch = await marker.getAttribute('style');
    const touch = { x: Math.round(area.x + area.width * 0.65), y: Math.round(area.y + area.height * 0.7) };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.x - 65, y: touch.y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    assert.notEqual(await marker.getAttribute('style'), beforeTouch);
    await client.detach();
    console.log('PASS: touch drag changes the 3D camera');
    await page.locator('.scenario-canvas canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.getByText('The 3D view is unavailable.', { exact: false }).waitFor();
    await page.locator('.scene-cue-list button').nth(1).click();
    assert(await page.locator('.scene-cue-detail').isVisible());
    await page.getByRole('button', { name: 'Retry 3D view' }).click();
    await page.locator('.scenario-canvas canvas').waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.scenario-stage-fallback').count(), 0);
    console.log('PASS: real WebGL context loss, accessible cues, and successful renderer retry');
    const chat = await context.newPage();
    chat.on('pageerror', e => errors.push(e.message));
    const base = new URL(process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173/voice');
    await chat.goto(`${base.origin}/voice/chat?scenario=cafe&mode=beginner&dialogMode=goal_oriented&scoring=ielts`);
    await chat.getByRole('button', { name: 'Step into Café', exact: false }).click();
    await chat.locator('.scenario-canvas canvas').waitFor();
    await chat.locator('.scene-cue-list button').first().click();
    assert(await chat.locator('.scene-cue-detail blockquote').isVisible());
    await chat.getByRole('button', { name: 'Return to the conversation' }).click();
    assert.equal(await chat.locator('.scenario-canvas canvas').count(), 0);
    assert(await chat.getByText('Hey! Welcome to Brew & Bean! What can I get started for you?', { exact: false }).first().isVisible());
    await chat.close();
    console.log('PASS: live conversation opens and dismisses the scene without losing messages');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
    });
    await page.reload();
    await page.getByRole('button', { name: 'Retry 3D view' }).waitFor();
    await page.locator('.scene-cue-list button').first().click();
    assert(await page.locator('.scene-cue-detail').isVisible());
    await page.getByRole('button', { name: 'Start conversation', exact: false }).click();
    await page.getByRole('heading', { name: 'Choose Practice Mode' }).waitFor();
    console.log('PASS: no-WebGL fallback preserves task cues and conversation entry');
    assert.deepEqual(errors, []);
    console.log(`PASS: no uncaught errors. Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
