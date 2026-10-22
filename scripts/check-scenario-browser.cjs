const assert = require('node:assert/strict');
const path = require('node:path');
require('node:fs').mkdirSync(process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-experience', { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/api/local-data', r => r.fulfill({ json: { ok: true, data: { id: 'scene-test', full_name: 'Learner', role: 'user' } } }));
    await page.goto(process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173/voice');
    await page.getByRole('button', { name: 'Rotate scene right' }).waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'Rotate scene right' }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.scenario-spotlight').screenshot({ path: path.join(process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-experience', 'scenario-mobile.png') });
    console.log('PASS: 390px and 320px scene previews and controls do not overflow');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Preview Airport', exact: true }).hover();
    assert.equal(await page.getByRole('button', { name: 'Preview Airport', exact: true }).evaluate(e => getComputedStyle(e).transform), 'none');
    await page.getByRole('button', { name: 'Preview Airport', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Airport spatial preview', { exact: true }).waitFor();
    console.log('PASS: reduced motion removes card tilt and keyboard selection still works');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
    });
    await page.reload();
    await page.getByText('The 3D view is unavailable. You can still explore every object below.').waitFor();
    assert(await page.getByRole('link', { name: 'Practise on video' }).isVisible());
    await page.getByRole('button', { name: 'Start conversation' }).click();
    await page.getByRole('heading', { name: 'Choose Practice Mode' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: WebGL failure leaves scene brief and both practice routes usable; no uncaught exceptions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
