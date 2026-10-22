const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.SPEAKNOW_TEST_ARTIFACTS || '/private/tmp/speaknow-cafe-dialogue';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route('**/api/local-data', r => r.fulfill({ json: { ok: true, data: { id: 'cafe-test', full_name: 'Café learner', role: 'user' } } }));
    await context.route('**/api/admin-track', r => r.fulfill({ json: { ok: true } }));
    const requests = [], errors = [];
    let release;
    await context.route('**/api/voice-chat', async route => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: requests.length === 1 ? { source: 'fallback', fallback_reason: 'test-offline', reply: 'For local café practice: check the milk choice.', feedback: { task: 'Try a milk-choice follow-up.' } } : { source: 'ai', reply: 'One oat-milk latte noted. What are the other four drinks?', feedback: { grammar: 'A clear request.' } } });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5190';
    await page.goto(`${base}/voice/chat?scenario=cafe&mode=beginner&dialogMode=goal_oriented&scoring=ielts`);
    await page.getByLabel('Read coach replies aloud').uncheck();
    await page.getByRole('button', { name: 'Step into Café', exact: false }).click();
    await page.locator('.scenario-canvas canvas').waitFor();
    await page.locator('.scene-cue-list button').first().click();
    const draftAction = page.getByRole('button', { name: 'Use as a reply draft' });
    await draftAction.click();
    const input = page.getByRole('textbox', { name: 'Your reply', exact: true });
    assert.equal(await input.inputValue(), 'Could I get five drinks, including one latte with oat milk?');
    assert.equal(requests.length, 0, 'inspecting and using a cue must not send or score it');
    assert(await input.evaluate(el => document.activeElement === el), 'draft handoff focuses the real composer');
    await input.fill('Please keep my own draft.');
    await page.locator('.scene-cue-list button').nth(1).click();
    assert(await draftAction.isDisabled());
    assert.equal(await input.inputValue(), 'Please keep my own draft.');
    await input.fill('Five drinks, please, with one oat-milk latte.');
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.speaking-room')?.dataset.interactionState === 'processing');
    assert(await draftAction.isDisabled());
    assert(await page.getByRole('button', { name: 'Reply to the barista' }).isDisabled());
    assert.equal(requests[0].sceneCueId, 'menu');
    assert.equal(requests[0].userText, 'Five drinks, please, with one oat-milk latte.');
    release();
    await page.getByText('Local practice prompt', { exact: true }).waitFor();
    assert((await page.locator('.scene-dialogue p').innerText()).includes('check the milk choice'));
    // Browsing or choosing another cue must not change context for a failed turn.
    await draftAction.click();
    assert((await input.inputValue()).includes('label the oat-milk latte'));
    await page.getByRole('button', { name: 'Retry this request', exact: true }).click();
    await page.locator('.scene-dialogue p').filter({ hasText: 'What are the other four drinks?' }).waitFor();
    assert.equal(requests[1].sceneCueId, 'menu');
    assert.equal(requests[1].userText, requests[0].userText);
    assert.equal(await page.locator('.studio-message.flex-row-reverse').count(), 1);
    assert.equal(await page.locator('.studio-message').count(), 3);
    assert.equal(await page.locator('.studio-message.flex-row-reverse').getByText('A clear request.', { exact: false }).count(), 0, 'coach notes begin collapsed for café');
    await page.getByRole('button', { name: 'Coach note' }).click();
    await page.getByText('A clear request.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Return to the conversation', exact: false }).click();
    assert.equal(await page.locator('.scenario-canvas canvas').count(), 0);
    assert((await input.inputValue()).includes('label the oat-milk latte'));
    await page.getByRole('button', { name: 'Step into Café', exact: false }).click();
    await page.locator('.scenario-canvas canvas').waitFor();
    const panelBounds = await page.locator('.voice-scene-panel').boundingBox();
    const conversationBounds = await page.locator('.room-conversation').boundingBox();
    assert(panelBounds.y + panelBounds.height < conversationBounds.y + conversationBounds.height, 'the full scene fits inside the conversation without being clipped');
    await page.locator('.voice-scene-panel').screenshot({ path: path.join(out, 'cafe-live-desktop.png') });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.scene-cue-list button').nth(2).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await page.locator('.scene-cue-detail').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      await page.locator('.voice-scene-panel').screenshot({ path: path.join(out, `cafe-live-${width}.png`) });
    }
    // Free talk uses the same objects with conversational, rather than mission, openings.
    await page.goto(`${base}/voice/chat?scenario=cafe&mode=beginner&dialogMode=free_talk&scoring=daily`);
    await page.getByLabel('Read coach replies aloud').uncheck();
    await page.getByRole('button', { name: 'Step into Café', exact: false }).click();
    await page.locator('.scene-cue-list button').first().click();
    await page.getByRole('button', { name: 'Use as a reply draft' }).click();
    assert.equal(await input.inputValue(), 'What coffee would you recommend today?');
    // A second scene retains its original controls and has no café draft action.
    await page.goto(`${base}/voice/chat?scenario=airport&mode=beginner&dialogMode=goal_oriented&scoring=ielts`);
    await page.getByRole('button', { name: 'Step into Airport', exact: false }).click();
    await page.locator('.scene-cue-list button').first().click();
    assert.equal(await page.locator('.scene-dialogue').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Use as a reply draft' }).count(), 0);
    // No-WebGL still offers the draft handoff and real conversation.
    await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); }; });
    await page.goto(`${base}/voice/chat?scenario=cafe&mode=advanced&dialogMode=goal_oriented&scoring=ielts`);
    await page.getByRole('button', { name: 'Step into Café', exact: false }).click();
    await page.locator('.scenario-stage-fallback').waitFor();
    await page.locator('.scene-cue-list button').nth(2).click();
    await page.getByRole('button', { name: 'Use as a reply draft' }).click();
    assert((await input.inputValue()).includes('Which pastries are dairy-free'));
    assert.deepEqual(errors, []);
    console.log('PASS: café draft handoff, text preservation, pending lock, context-preserving retry, live reply, optional feedback, scene open/close, free talk, mobile layouts, other-scene isolation and no-WebGL');
    console.log(`Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
