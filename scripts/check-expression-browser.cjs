/* Real Chrome interaction checks with simulated media, landmarks and account/API responses.
 * No personal account, physical camera, external model or database writes are used.
 * PLAYWRIGHT_MODULE can point to an existing Playwright installation.
 * CHROME_PATH, SPEAKNOW_TEST_URL and SPEAKNOW_TEST_ARTIFACTS are optional overrides.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SPEAKNOW_TEST_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.SPEAKNOW_TEST_ARTIFACTS || '/tmp/speaknow-experience';
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS: ${name}`); };
const user = { id: 'expression-ux-test', full_name: 'Test Learner', role: 'user' };
const notebookKey = `speaknow.expression.v1.${user.id}`;
const errors = [];

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  async function newPage({ mobile = false, vision = true } = {}) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/local-data', route => route.fulfill({ json: { ok: true, data: route.request().postDataJSON().action === 'me' ? user : [] } }));
    await page.route('**/api/expression-service', route => route.fulfill({ json: { available: false, providers: [], connection: 'not_tested' } }));
    await page.route('**/api/expression-review', route => route.fulfill({ status: 503, json: { error: 'Test provider unavailable' } }));
    await page.addInitScript(() => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;
      window.__testGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    });
    await page.route('**/expression-worker.js', route => route.fulfill({ contentType: 'application/javascript', body: vision
      ? `self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});if(data.type==='frame'){data.frame.close();self.postMessage({type:'sample',time:data.time,head:Math.sin(data.time*4)*0.2,posture:0.04});}};`
      : `self.onmessage=()=>self.postMessage({type:'error'});` }));
    return page;
  }
  async function record(page, duration = 3300, button = /Start video practice|Record another session|Record another take/) {
    await page.getByRole('button', { name: button }).click();
    await page.getByRole('button', { name: 'Finish & review' }).waitFor();
    await page.waitForTimeout(duration); // Exercise the real MediaRecorder and recording timer.
    await page.getByRole('button', { name: 'Finish & review' }).click();
    await page.getByRole('heading', { name: 'Moments to revisit' }).waitFor();
  }
  async function inViewport(locator) {
    return locator.evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  }
  try {
    const page = await newPage();
    await page.goto(`${base}/voice`);
    assert.equal(await page.getByRole('button', { name: /^Preview / }).count(), 12);
    await page.getByRole('button', { name: 'Rotate scene right' }).waitFor();
    const stage = page.locator('.scenario-stage');
    const beforeRotation = await stage.screenshot();
    await page.getByRole('button', { name: 'Rotate scene right' }).click();
    const afterRotation = await stage.screenshot();
    assert(!beforeRotation.equals(afterRotation), 'Rotation must change the rendered scene');
    for (const title of ['Airport', 'Bank', 'Hotel', 'Restaurant', 'Shopping', 'Hospital', 'University', 'Office', 'Phone Call', 'Car Rental', 'Museum', 'Café']) {
      await page.getByRole('button', { name: `Preview ${title}`, exact: true }).click();
      await page.getByLabel(`${title} spatial preview`, { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: `Preview ${title}`, exact: true }).getAttribute('aria-pressed'), 'true');
    }
    await page.getByRole('button', { name: 'Preview Office', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'scenario-desktop.png') });
    await page.getByRole('button', { name: 'Start conversation' }).click();
    await page.getByRole('button', { name: /^Basic/ }).click();
    await page.getByRole('button', { name: /^Goal-Oriented/ }).click();
    await page.getByRole('button', { name: /^Daily/ }).click();
    await page.waitForURL('**/voice/setup?**');
    assert(new URL(page.url()).searchParams.get('scenario') === 'office');
    pass('All 12 scenes selectable; 3D rotation changes preview; existing conversation setup preserved');

    await page.goto(`${base}/voice`);
    await page.locator('.scenario-partnership summary').click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download a collaboration brief' }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'speaknow-collaboration-brief.md');
    pass('Partnership window downloads an honest planning brief without submitting data');
    await page.getByRole('button', { name: 'Preview Office', exact: true }).click();
    await page.getByRole('link', { name: 'Practise on video' }).click();
    await page.getByRole('button', { name: 'Start video practice' }).waitFor();
    const situation = page.getByRole('region', { name: 'Your speaking situation' });
    assert.equal(await situation.getByRole('combobox').first().inputValue(), 'office');
    assert((await situation.getByRole('textbox').inputValue()).includes('vacation'));
    await situation.getByRole('textbox').fill('');
    assert.equal(await page.getByRole('button', { name: 'Start video practice' }).isEnabled(), false);
    await situation.getByRole('textbox').fill('I want my manager to understand my coverage plan.');
    await page.locator('.expression-method summary').click();
    assert.equal(await page.locator('.expression-method a').count(), 3);
    await page.locator('.expression-method summary').click();
    await situation.screenshot({ path: path.join(artifacts, 'context-before-recording.png') });
    pass('Selected scene transfers to video; listener goal required; research basis accessible');

    await record(page, 10400);
    assert(await inViewport(page.getByRole('heading', { name: 'Moments to revisit' })));
    assert.equal(await page.locator('.expression-clips article').count(), 2);
    await page.locator('.expression-review').screenshot({ path: path.join(artifacts, 'desktop-review-fixed.png') });
    pass('Recording completes and moves keyboard focus and viewport to review');
    assert(await page.locator('#expression-review').evaluate(e => e === document.activeElement));

    let clip = page.locator('.expression-clips article').first();
    assert.equal(await clip.getByRole('button', { name: 'Practise this moment' }).isEnabled(), false);
    assert(await clip.getByText('Add what you said below to practise this moment.').isVisible());
    await clip.getByRole('button', { name: /Replay/ }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector('.expression-video video');
      return v.paused && v.currentTime >= 8 && v.currentTime < 8.5;
    });
    await page.getByRole('button', { name: 'Back to this moment' }).click();
    assert(await clip.evaluate(e => e === document.activeElement));
    pass('Clip stops at its boundary; Back to this moment restores card focus');

    await clip.getByLabel('What you said').fill('I think we should meet earlier so everyone can join.');
    assert.equal(await clip.getByRole('button', { name: 'This feels like me' }).isEnabled(), false);
    await clip.getByLabel('What you meant').selectOption('Explaining');
    await clip.getByRole('button', { name: 'This feels like me' }).click();
    const filters = page.getByRole('group', { name: 'Filter review moments' });
    await filters.getByRole('button', { name: /Confirmed/ }).click();
    assert.equal(await page.locator('.expression-clips article').count(), 1);
    await clip.getByLabel('What you said').fill('Meeting earlier helps everyone join.');
    await page.getByRole('heading', { name: 'No moments here yet.' }).waitFor();
    await filters.getByRole('button', { name: /All moments/ }).click();
    await clip.getByRole('button', { name: 'This feels like me' }).click();
    await filters.getByRole('button', { name: /To review/ }).click();
    await page.locator('.expression-clips article').getByRole('button', { name: 'Observation is inaccurate' }).click();
    await page.getByRole('heading', { name: 'Every moment has been reviewed.' }).waitFor();
    await filters.getByRole('button', { name: /Excluded/ }).click();
    assert.equal(await page.locator('.expression-clips article').count(), 1);
    await filters.getByRole('button', { name: /Confirmed/ }).click();
    pass('Context gates confirmation; editing invalidates evidence; all filters and empty states work');

    await page.getByRole('button', { name: 'Add context-aware reflection questions' }).click();
    const modelNotice = page.locator('#expression-review').getByText('Context notes are unavailable. Your video and local comparisons are still available.');
    await modelNotice.waitFor();
    assert(await inViewport(modelNotice));
    assert(await page.getByRole('button', { name: 'Add context-aware reflection questions' }).isEnabled());
    pass('Model failure is explained beside the action and allows retry');

    await clip.getByRole('button', { name: 'Practise this moment' }).click();
    const lab = page.getByRole('region', { name: 'Expression experiment' });
    assert.equal(await page.getByRole('button', { name: 'Record another take' }).isEnabled(), false);
    await lab.getByRole('textbox').fill('I want my friend to understand why meeting earlier helps.');
    await lab.getByRole('button', { name: 'Record a second take' }).click();
    await page.getByRole('button', { name: 'Finish & review' }).waitFor();
    await page.waitForTimeout(3300);
    await page.getByRole('button', { name: 'Finish & review' }).click();
    await lab.getByLabel('Choose the matching moment from your second take').selectOption({ index: 1 });
    await lab.getByText('Add the words from your second take above before saving.').waitFor();
    await lab.getByLabel('Words from your second take').fill('Let us meet earlier, so everyone can make it.');
    await lab.getByRole('checkbox').check();
    await lab.getByRole('button', { name: 'Keep the new approach' }).click();
    await lab.getByLabel('What will you keep or change next time?').fill('The shorter opening makes the reason easier to follow.');
    assert(await lab.getByRole('button', { name: 'Save my learning' }).isEnabled());
    await lab.getByLabel('Words from your second take').fill('Let us meet earlier so everyone can join us.');
    assert.equal(await lab.getByRole('checkbox').isChecked(), false);
    assert.equal(await lab.getByRole('button', { name: 'Save my learning' }).isEnabled(), false);
    await lab.getByRole('checkbox').check();
    await lab.getByRole('button', { name: 'Save my learning' }).click();
    await lab.getByRole('button', { name: 'Experiment saved' }).waitFor();
    pass('No-transcription A/B flow completes inline; transcript changes require reconfirming same meaning');

    await lab.locator('.practice-take').first().getByRole('button', { name: 'Replay this moment' }).click();
    await page.waitForFunction(() => document.querySelector('.practice-take video').currentTime > 0.2);
    await lab.locator('.practice-take').last().getByRole('button', { name: 'Replay this moment' }).click();
    await page.waitForFunction(() => {
      const [a, b] = document.querySelectorAll('.practice-take video');
      return a.paused && !b.paused && b.currentTime > 0.1;
    });
    assert(await lab.locator('video').first().evaluate(v => v.readyState >= 2));
    pass('Original recording survives second take and A/B audio does not overlap');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await lab.screenshot({ path: path.join(artifacts, 'mobile-ab-fixed.png') });
    pass('Review and A/B comparison fit 390px and 320px viewports');

    await page.reload();
    await page.getByRole('button', { name: 'Start video practice' }).waitFor();
    assert.equal(await page.locator('.practice-memory details').count(), 1);
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), notebookKey);
    assert.equal(stored.filter(h => h.decision === 'habit').length, 1);
    assert.equal(stored.find(h => h.decision === 'habit').brief.scenarioId, 'office');
    await page.locator('.practice-memory summary').click();
    await page.getByRole('button', { name: 'Delete this reflection' }).click();
    assert.equal(await page.locator('.practice-memory details').count(), 0);
    pass('Notebook and learning persist on reload; reflection deletion works');
    await page.context().close();

    const fallback = await newPage({ mobile: true, vision: false });
    await fallback.goto(`${base}/voice/casual-video`);
    await fallback.getByRole('button', { name: 'Start video practice' }).waitFor();
    await fallback.getByLabel('What should your listener understand or do?').fill('I want my friend to understand my idea.');
    await fallback.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test permission denied', 'NotAllowedError'); }; });
    await fallback.getByRole('button', { name: 'Start video practice' }).click();
    await fallback.getByText('Camera or microphone permission was declined. Allow access in browser settings and try again.').waitFor();
    assert(await fallback.getByRole('button', { name: 'Start video practice' }).isEnabled());
    await fallback.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__testGetUserMedia; });
    await record(fallback);
    assert(await inViewport(fallback.getByRole('heading', { name: 'Moments to revisit' })));
    const manual = fallback.locator('.expression-clips article').first();
    await manual.getByLabel('What you meant').selectOption('Explaining');
    assert.equal(await manual.getByRole('button', { name: 'This feels like me' }).isEnabled(), false);
    await manual.getByLabel('What you said').fill('I can still review my recording without movement analysis.');
    assert(await manual.getByRole('button', { name: 'Practise this moment' }).isEnabled());
    await fallback.locator('.expression-review').screenshot({ path: path.join(artifacts, 'mobile-limited-evidence.png') });
    pass('Denied camera is recoverable; unavailable vision/transcription preserve manual practice');

    const originalUrl = await fallback.locator('.expression-video video').getAttribute('src');
    await fallback.getByRole('button', { name: 'Prepare a different situation' }).click();
    await fallback.getByRole('region', { name: 'Your speaking situation' }).getByRole('combobox').first().selectOption('cafe');
    assert.equal(await fallback.locator('.expression-goal-review').getByText('I want my friend to understand my idea.', { exact: true }).count(), 1, 'Preparing a new context must not relabel an existing recording');
    await fallback.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test permission denied', 'NotAllowedError'); }; });
    await fallback.getByRole('button', { name: 'Record another session' }).click();
    await fallback.locator('#expression-review').getByText('Camera or microphone permission was declined. Allow access in browser settings and try again.').waitFor();
    assert.equal(await fallback.locator('.expression-video video').getAttribute('src'), originalUrl);
    assert.equal(await manual.getByLabel('What you said').inputValue(), 'I can still review my recording without movement analysis.');
    assert(await fallback.getByRole('link', { name: 'Save video' }).isVisible());
    pass('New scene preparation and failed repeat recording retain the previous video, goal, transcript and review controls');
    await fallback.context().close();

    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    pass('No uncaught browser exceptions across all scenarios');
    await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, errors, mocked: ['account API', 'camera/microphone input', 'landmarks', 'model failure'], browser: await browser.version() }, null, 2));
    console.log(`Completed ${checks.length} checks. Artifacts: ${artifacts}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
