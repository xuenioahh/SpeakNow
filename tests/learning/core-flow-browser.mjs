import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { QUESTION_SETS, getBankTask, examPath } from '../../shared/questionBank.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || (process.argv.includes('--origin') ? process.argv[process.argv.indexOf('--origin') + 1] : 'http://127.0.0.1:5210');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 1000 } });
// Keep visual checks independent of external font-network availability.
await context.route('https://fonts.googleapis.com/**', route => route.abort());
await context.route('https://fonts.gstatic.com/**', route => route.abort());
const page = await context.newPage(), passed = [], errors = [];
page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
if (process.argv.includes('--native-speech')) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  const sentences = ['Painting Class', 'Campus Tour Guide'].map(title => QUESTION_SETS.find(set => set.setTitle === title).questions[0].questionText);
  const result = await page.evaluate(async sentences => {
    const { audioManager } = await import('/src/lib/audioManager.js');
    const events = [], nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      for (const event of ['start', 'end', 'error']) utterance.addEventListener(event, value => events.push({ event, text: utterance.text, error: value.error || null }));
      nativeSpeak(utterance);
    };
    const playback = [];
    for (const sentence of sentences) playback.push({ sentence, completed: await audioManager.playAIVoice(sentence, 'female', { concise: false, maxChars: 3000, startTimeoutMs: 2000 }) });
    await new Promise(resolve => setTimeout(resolve, 100));
    return { supported: audioManager.isSupported(), voiceCount: speechSynthesis.getVoices().length, playback, events };
  }, sentences);
  await fs.writeFile('docs/core-flow-2026-10-24/native-speech-results.json', JSON.stringify({ ...result, limitation: 'Native browser speech events verified; audible output quality was not manually assessed.' }, null, 2));
  console.log(JSON.stringify(result)); await browser.close(); process.exit(0);
}
await context.addInitScript(() => {
  window.__spoken = []; window.__answer = 'I eat fruit and exercise every day.'; window.__streams = []; window.__ttsFailure = false;
  const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => { if (window.__denyMic) throw new DOMException('Denied', 'NotAllowedError'); const stream = await media(options); window.__streams.push(stream); return stream; };
  class Recognition {
    start() { setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); setTimeout(() => { if (window.__emptyASR) return; const item = [{ transcript: window.__answer }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 80); }, 20); }
    stop() { this.onaudioend?.(); setTimeout(() => this.onend?.(), 25); } abort() {}
  }
  window.SpeechRecognition = Recognition; window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Controlled browser voice' }], addEventListener() {}, resume() {}, cancel() {}, speak(utterance) { window.__spoken.push(utterance.text); utterance.onstart?.(); setTimeout(() => window.__ttsFailure ? utterance.onerror?.() : utterance.onend?.(), 40); } } });
});
const findSet = title => QUESTION_SETS.find(set => set.setTitle === title);
const painting = findSet('Painting Class'), campus = findSet('Campus Tour Guide'), health = findSet('Health and Diet');
const setElement = set => page.locator(`[data-set-id="${set.setId}"]`);
let originalId, retryId, campusId, healthId;
let initialFeedbackCalls = 0, releaseInitialFeedback;
const initialFeedbackHold = new Promise(resolve => releaseInitialFeedback = resolve);
async function test(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
async function rows(store) { return page.evaluate(async store => (await import('/src/lib/learningStore.js')).learningStore.all(store), store); }
async function screenshot(name, fullPage = true) { await page.waitForTimeout(250); await page.screenshot({ path: `docs/core-flow-2026-10-24/${name}.png`, fullPage }); }
async function goto(path) { await page.goto(origin + path, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { level: 1 }).waitFor(); }
async function begin() { await page.getByRole('button', { name: /^Start (Practice|Exam)$/, exact: true }).click(); await page.locator('.exam-question').waitFor(); }
async function record(text, { repeat = false, prompt = '' } = {}) {
  await page.evaluate(text => { window.__answer = text; }, text);
  if (repeat) {
    assert.equal(await page.getByText(prompt, { exact: true }).count(), 0, 'reference hidden before repetition');
    await page.getByRole('button', { name: /^(Play sentence|Listen again)$/ }).click();
    await page.getByRole('button', { name: 'Listen again', exact: true }).waitFor();
    const spoken = (await page.evaluate(() => window.__spoken)).join(' ');
    assert.ok(spoken.includes(prompt), `the selected sentence must be played: ${prompt}; actual=${JSON.stringify(spoken)}`);
  }
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
  assert.match(await page.getByRole('timer').innerText(), /Recording/);
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your transcript', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Your transcript', exact: true }).inputValue(), text);
  await page.getByLabel('Review recording', { exact: true }).waitFor();
}
async function finish() { await page.getByRole('button', { name: 'Finish and get feedback', exact: true }).click(); await page.waitForURL('**/practice/review?id=*'); await page.getByRole('heading', { level: 1 }).waitFor(); return new URL(page.url()).searchParams.get('id'); }
try {
  await test('A: two large home cards and two task types route to real banks, without playback', async () => {
    await goto('/'); assert.equal(await page.locator('.direction-card').count(), 2); assert.equal(await page.locator('.direction-card button').count(), 0); assert.ok(await page.locator('.direction-card h2').first().evaluate(heading => parseFloat(getComputedStyle(heading).fontSize) >= 48));
    const boxes = await page.locator('.direction-card').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { x: r.x, width: r.width, height: r.height }; }));
    assert.equal(boxes[0].height, boxes[1].height); assert.ok(boxes[1].x > boxes[0].x); assert.ok(boxes[0].height >= 650);
    await screenshot('home-desktop'); await page.locator('.exam-direction').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/exam'); await page.getByRole('heading', { name: 'TOEFL Speaking', exact: true }).waitFor();
    assert.equal(await page.locator('.task-type-card').count(), 2); assert.equal(await page.locator('audio,textarea').count(), 0);
    assert.doesNotMatch(await page.locator('main').innerText(), /IELTS|library opens|Quick practice|Mock test/); await screenshot('types-desktop');
    await page.getByRole('link', { name: /Listen and Repeat Listen to sentences/ }).click(); await page.waitForURL('**/exam/bank/repeat'); await page.locator('.bank-set').first().waitFor();
    assert.equal(await page.locator('.bank-set').count(), 49); assert.match(await page.locator('main').innerText(), /340 sentences/);
    assert.deepEqual(await page.evaluate(() => window.__spoken), []); assert.equal(await page.locator('audio').count(), 0);
    await screenshot('repeat-bank-desktop', false);
  });
  await test('B/D: Painting full set records all seven real answers in order; preparation is independent', async () => {
    await setElement(painting).getByRole('link', { name: /^Practise set:/ }).click(); await page.waitForURL('**/exam/prepare?*');
    assert.equal(new URL(page.url()).searchParams.get('setId'), painting.setId); assert.match(await page.locator('main').innerText(), /Painting Class · 7 sentences/);
    assert.equal(await page.locator('audio,textarea').count(), 0); assert.equal(await page.locator('.exam-intro button').count(), 1); await screenshot('preparation-desktop');
    await page.getByRole('button', { name: /^Start (Practice|Exam)$/, exact: true }).evaluate(button => { button.click(); button.click(); }); await page.waitForURL('**/exam/practice?*');
    originalId = new URL(page.url()).searchParams.get('session');
    await page.route('**/api/speaking-feedback', async route => { initialFeedbackCalls++; await initialFeedbackHold; await route.fulfill({ status: 503, json: { error: 'Controlled feedback outage.' } }); });
    for (let index = 0; index < painting.questions.length; index++) {
      await page.getByText(`Question ${index + 1} / 7`, { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('main').innerText(), /Browser-generated|Listen to each sentence|Sign in|Start Practice|feedback is based/i);
      assert.equal(await page.getByRole('button', { name: 'Finish and get feedback' }).count(), 0);
      if (!index) await screenshot('repeat-practice-desktop');
      await record(index ? painting.questions[index].questionText : 'Welcome to painting class.', { repeat: true, prompt: painting.questions[index].questionText });
      if (index < 6) await page.getByRole('button', { name: 'Next Question', exact: true }).click();
      else assert.equal(await finish(), originalId);
    }
    const saved = (await rows('attempts')).find(attempt => attempt.id === originalId);
    assert.equal(saved.completed, true); assert.equal(saved.setId, painting.setId); assert.equal(saved.answers.length, 7);
    assert.deepEqual(saved.answers.map(answer => answer.questionId), painting.questions.map(question => question.questionId));
    assert.equal(new Set(saved.answers.map(answer => answer.recordingId)).size, 7);
    const sizes = await page.evaluate(async ids => { const { learningStore } = await import('/src/lib/learningStore.js'); return Promise.all(ids.map(async id => (await learningStore.get('recordings', id))?.blob?.size || 0)); }, saved.answers.map(answer => answer.recordingId));
    assert.equal(sizes.length, 7); assert.ok(sizes.every(size => size > 0));
    assert.equal(await page.locator('.review-differences').count(), 7); assert.ok(await page.locator('.review-differences').first().isVisible());
  });
  await test('D: AI loading prevents duplicate submission; outage retains recordings and retry shows grounded feedback', async () => {
    await page.getByRole('button', { name: 'Reviewing…', exact: true }).waitFor(); assert.ok(await page.getByRole('button', { name: 'Reviewing…', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Reviewing…', exact: true }).evaluate(button => { button.click(); button.click(); }); releaseInitialFeedback();
    await page.getByRole('alert').waitFor(); assert.equal(initialFeedbackCalls, 1); assert.equal((await rows('attempts')).find(attempt => attempt.id === originalId).answers.length, 7);
    await page.unroute('**/api/speaking-feedback');
    await page.route('**/api/speaking-feedback', route => route.fulfill({ json: { summary: 'The first transcript omits “the”.', strengths: [], improvements: [{ answerIndex: 0, quote: 'Welcome to painting class.', reason: 'The article is missing.', suggestion: 'Repeat “the painting class”.', exercise: 'Repeat the first sentence including “the”.' }] } }));
    await page.getByRole('button', { name: 'Retry feedback', exact: true }).click();
    for (const title of ['What You Practiced', 'Your Performance', 'Key Improvements', 'Practice Again']) await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await screenshot('repeat-review-desktop'); await page.unroute('**/api/speaking-feedback');
    await page.getByRole('button', { name: 'Practise this focus', exact: true }).click();
    const focusParams = new URL(page.url()).searchParams; assert.equal(focusParams.get('questionId'), painting.questions[0].questionId); assert.equal(focusParams.get('retry'), originalId); assert.equal(focusParams.get('focus'), 'Repeat the first sentence including “the”.');
    await page.goBack(); await page.getByRole('heading', { name: 'Your Performance', exact: true }).waitFor();
  });
  await test('E: retry selected non-first sentence, compare actual attempts, retry whole set, and return to correct bank', async () => {
    await page.getByRole('button', { name: 'Retry sentence 3', exact: true }).click(); await page.waitForURL('**/exam/prepare?*');
    let params = new URL(page.url()).searchParams; assert.equal(params.get('questionId'), painting.questions[2].questionId); assert.equal(params.get('retry'), originalId);
    await begin(); await page.getByText('Question 1 / 1', { exact: true }).waitFor(); await record(painting.questions[2].questionText, { repeat: true, prompt: painting.questions[2].questionText }); retryId = await finish();
    const saved = (await rows('attempts')).find(attempt => attempt.id === retryId); assert.equal(saved.parentId, originalId); assert.equal(saved.answers[0].questionIndex, 2);
    await page.getByRole('button', { name: 'Compare both attempts', exact: true }).click(); await page.locator('.learning-comparison audio').nth(6).waitFor(); assert.equal(await page.locator('audio').count(), 8);
    await page.getByRole('button', { name: 'Practise the whole set', exact: true }).click(); params = new URL(page.url()).searchParams;
    assert.equal(params.get('setId'), painting.setId); assert.equal(params.get('scope'), 'set'); assert.equal(params.get('retry'), retryId); assert.equal(params.has('questionId'), false);
    const wholeSetPath = page.url(); await page.goBack(); await page.getByRole('link', { name: 'Back to Bank', exact: true }).waitFor();
    await page.goForward(); await page.getByRole('button', { name: /^Start (Practice|Exam)$/, exact: true }).waitFor(); assert.equal(page.url(), wholeSetPath);
    await page.goBack(); await page.getByRole('link', { name: 'Back to Bank', exact: true }).click(); await page.waitForURL('**/exam/bank/repeat');
    await setElement(painting).getByText('Completed · 7/7 practised', { exact: true }).waitFor();
  });
  await test('D: unavailable playback, microphone denial and empty recognition have honest recoverable states', async () => {
    const kitchen = findSet('Kitchen Class');
    await goto(examPath(getBankTask(kitchen.setId), { questionIndex: 0 })); await begin();
    await page.evaluate(() => window.__ttsFailure = true); await page.getByRole('button', { name: 'Play sentence', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /audio unavailable/i); assert.ok(await page.getByRole('button', { name: 'Record answer', exact: true }).isDisabled());
    await page.evaluate(() => { window.__ttsFailure = false; window.__denyMic = true; }); await page.getByRole('button', { name: 'Play sentence', exact: true }).click(); await page.getByRole('button', { name: 'Listen again', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click(); await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /permission|blocked|denied/i); assert.equal(await page.locator('audio').count(), 0);
    await page.evaluate(() => { window.__denyMic = false; window.__emptyASR = true; }); await record('');
    assert.equal(await page.getByRole('button', { name: 'Finish and get feedback', exact: true }).count(), 0);
    await page.getByRole('textbox', { name: 'Your transcript', exact: true }).fill('Welcome to our kitchen class.');
    const id = await finish(); assert.equal((await rows('attempts')).find(attempt => attempt.id === id).answers[0].rawTranscript, '');
    await page.evaluate(() => window.__emptyASR = false);
  });
  await test('B/E: Campus sentence five uses different material; refresh, exit, bank resume and playback preserve that take', async () => {
    await goto('/exam/bank/repeat'); const group = setElement(campus); await group.locator('summary').click(); await group.getByRole('link').filter({ hasText: campus.questions[4].questionText }).click(); await begin();
    await record(campus.questions[4].questionText, { repeat: true, prompt: campus.questions[4].questionText });
    const before = (await rows('drafts')).find(draft => draft.taskId === campus.setId); const clip = before.recordingId;
    await page.reload(); await page.getByLabel('Review recording', { exact: true }).waitFor(); assert.equal(await page.getByRole('textbox', { name: 'Your transcript' }).inputValue(), campus.questions[4].questionText);
    await page.getByRole('button', { name: 'Save and exit', exact: true }).click(); await page.waitForURL('**/exam/bank/repeat');
    await setElement(campus).getByText('In progress · 0/7 practised', { exact: true }).waitFor(); await setElement(campus).locator('summary').click(); await setElement(campus).getByRole('link').filter({ hasText: campus.questions[4].questionText }).click();
    await page.getByLabel('Review recording', { exact: true }).waitFor(); assert.equal((await rows('drafts')).find(draft => draft.taskId === campus.setId).recordingId, clip);
    await page.getByLabel('Review recording', { exact: true }).evaluate(async audio => { await audio.play(); }); await page.waitForFunction(() => document.querySelector('audio').currentTime > 0); campusId = await finish();
    const saved = (await rows('attempts')).find(attempt => attempt.id === campusId); assert.equal(saved.answers[0].questionId, campus.questions[4].questionId); assert.equal(saved.answers.length, 1);
    assert.notEqual(saved.answers[0].prompt, painting.questions[0].questionText);
  });
  await test('C: search, category and status filters use real data; reference is absent until the selected answer is submitted', async () => {
    await goto('/exam/bank/repeat'); await setElement(painting).getByText('Completed · 7/7 practised', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Practice status', exact: true }).selectOption('completed'); assert.equal(await page.locator('.bank-set').count(), 1);
    await page.getByRole('combobox', { name: 'Practice status', exact: true }).selectOption('unfinished'); assert.equal(await setElement(painting).count(), 0); assert.equal(await setElement(campus).count(), 1);
    await goto('/exam/bank/interview'); assert.equal(await page.locator('.bank-set').count(), 77); assert.match(await page.locator('main').innerText(), /288 questions/);
    await page.getByRole('searchbox', { name: 'Search' }).fill('Health and Diet'); assert.equal(await page.locator('.bank-set').count(), 1);
    await page.getByLabel('Category', { exact: true }).selectOption('Health and Diet');
    await setElement(health).locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.getByText(health.questions[1].referenceAnswer, { exact: true }).count(), 0);
    await setElement(health).getByRole('link').filter({ hasText: health.questions[1].questionText }).click(); await begin();
    await page.getByRole('heading', { level: 1, name: health.questions[1].questionText, exact: true }).waitFor();
    assert.equal(await page.getByText(health.questions[1].referenceAnswer, { exact: true }).count(), 0);
    await record('I eat fruit daily.'); await page.getByRole('textbox', { name: 'Your transcript' }).fill('I eat fruit and vegetables every day.'); await finish();
    await page.getByText('Reference answer (practice example)', { exact: true }).click(); assert.ok(await page.getByText(health.questions[1].referenceAnswer, { exact: true }).isVisible());
    await page.getByText('Original transcript', { exact: true }).click(); await page.getByText('I eat fruit daily.', { exact: true }).waitFor();
    const saved = (await rows('attempts')).find(attempt => attempt.answers[0]?.questionId === health.questions[1].questionId); assert.equal(saved.answers[0].rawTranscript, 'I eat fruit daily.'); assert.equal(saved.answers[0].text, 'I eat fruit and vegetables every day.');
  });
  await test('C/E: interview full topic resumes exact question and records all four source questions in order', async () => {
    await page.getByRole('link', { name: 'Back to Bank', exact: true }).click(); await setElement(health).getByRole('link', { name: /^Practise set:/ }).click(); await begin();
    await record('I exercise regularly and eat a balanced diet.'); await page.getByRole('button', { name: 'Next Question', exact: true }).click(); await page.getByText('Question 2 / 4', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save and exit', exact: true }).click(); await page.waitForURL('**/exam/bank/interview');
    await setElement(health).getByRole('link', { name: /^Continue:/ }).click(); await page.getByText('Question 2 / 4', { exact: true }).waitFor();
    await page.reload(); await page.getByText('Question 2 / 4', { exact: true }).waitFor();
    for (let index = 1; index < 4; index++) { await page.getByRole('heading', { level: 1, name: health.questions[index].questionText, exact: true }).waitFor(); await record('I make time for healthy meals and regular exercise.'); if (index < 3) await page.getByRole('button', { name: 'Next Question', exact: true }).click(); else healthId = await finish(); }
    assert.deepEqual((await rows('attempts')).find(attempt => attempt.id === healthId).answers.map(answer => answer.questionId), health.questions.map(question => question.questionId));
    await goto('/practice/history'); await page.getByRole('link', { name: `Take an Interview · ${health.setTitle} →`, exact: true }).first().click(); assert.equal(new URL(page.url()).searchParams.get('id'), healthId);
  });
  await test('F: partial and combined source groups keep actual counts; invalid cross-set URLs do not load a default', async () => {
    const one = QUESTION_SETS.find(set => set.setTitle === 'Dining Out' && set.sourceDate === '4.15');
    const eight = findSet('Public Parks, Recreation, and Online Shopping');
    await goto('/exam/bank/interview'); assert.match(await setElement(one).innerText(), /1 question/); assert.match(await setElement(eight).innerText(), /8 questions/);
    await setElement(eight).getByRole('link', { name: /^Practise set:/ }).click(); await begin(); await page.getByText('Question 1 / 8', { exact: true }).waitFor();
    const startedSession = new URL(page.url()).searchParams.get('session');
    await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
    await setElement(eight).getByText('In progress · 0/8 practised · Continue set', { exact: true }).waitFor();
    await setElement(eight).getByRole('link', { name: /^Continue:/ }).click(); await page.getByText('Question 1 / 8', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('session'), startedSession);
    await goto(`/exam/prepare?taskType=repeat&setId=${painting.setId}&scope=question&questionId=${campus.questions[1].questionId}`); await page.getByRole('heading', { name: 'Practice unavailable', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Start Practice' }).count(), 0);
  });
  await test('E: anonymous save, authenticated failed/successful sync, cloud reload with real recordings, and confirmed deletion', async () => {
    await goto(`/practice/review?id=${healthId}`); await page.getByText('Saved locally', { exact: true }).waitFor();
    const registered = await page.evaluate(async () => (await fetch('/api/local-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email: `core-flow-${Date.now()}@example.invalid`, full_name: 'Core Flow Test', password: 'controlled-test-password' }) })).json()); assert.ok(registered.ok);
    await page.reload(); await page.getByRole('button', { name: 'Sync to my account', exact: true }).waitFor();
    await page.route('**/api/speaking-practice', route => route.fulfill({ status: 503, json: { error: 'Controlled sync outage.' } }), { times: 1 });
    await page.getByRole('button', { name: 'Sync to my account', exact: true }).click(); await page.getByText('Sync failed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry sync', exact: true }).click(); await page.getByText(/^(Saved on this server · not cloud-synced|Answers synced · feedback saved locally)$/).waitFor();
    await page.getByRole('button', { name: /^(Get AI feedback|Generate account feedback)$/ }).click(); await page.getByText('Saved on this server · not cloud-synced', { exact: true }).waitFor();
    await page.evaluate(async id => { const { learningStore } = await import('/src/lib/learningStore.js'); const attempt = await learningStore.get('attempts', id); for (const answer of attempt.answers) await learningStore.remove('recordings', answer.recordingId); await learningStore.remove('attempts', id); }, healthId);
    await page.reload(); await page.getByText('Saved on this server · not cloud-synced', { exact: true }).waitFor(); await page.locator('audio').nth(3).waitFor();
    assert.equal(await page.locator('audio').count(), 4); await page.locator('audio').first().evaluate(async audio => { await audio.play(); }); await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
    await page.getByRole('button', { name: 'Delete practice', exact: true }).click(); await page.getByRole('alertdialog').waitFor(); assert.match(await page.getByRole('alertdialog').innerText(), /and your account/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Delete practice', exact: true }).click(); await page.getByRole('button', { name: 'Confirm permanent deletion', exact: true }).click(); await page.waitForURL('**/practice/history');
  });
  await test('A/E: Daily card enters the selected real scenario and voice interaction remains functional', async () => {
    await goto('/'); await page.locator('.daily-direction').click(); await page.waitForURL('**/voice');
    await page.getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('advanced');
    await page.locator('.daily-scenario').filter({ has: page.getByRole('heading', { name: 'Hotel', exact: true }) }).click();
    await page.getByRole('heading', { name: 'Hotel', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start Conversation →', exact: true }).click();
    const params = new URL(page.url()).searchParams; assert.equal(params.get('scenario'), 'hotel'); assert.equal(params.get('mode'), 'advanced');
    await page.getByRole('textbox', { name: 'Your reply', exact: true }).fill('I would like a quiet room, please.'); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.getByText('Engineering fixture: would you like a small or large coffee?', { exact: true }).waitFor();
  });
  await test('E: signing out keeps owned attempts private while preserving guest practice', async () => {
    await goto(`/practice/review?id=${retryId}`); await page.getByRole('button', { name: 'Sync to my account', exact: true }).click();
    await page.getByText(/^(Saved on this server · not cloud-synced|Answers synced · feedback saved locally)$/).waitFor();
    await goto('/'); await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}), page.getByRole('button', { name: 'Sign out', exact: true }).click()]); await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
    await page.goto(`${origin}/practice/review?id=${retryId}`, { waitUntil: 'domcontentloaded' }); await page.getByText(/Practice not found on this device/).waitFor();
    await goto('/practice/history'); assert.equal(await page.locator(`a[href="/practice/review?id=${retryId}"]`).count(), 0);
    await goto(`/practice/review?id=${campusId}`); await page.getByText(campus.questions[4].questionText, { exact: true }).first().waitFor();
  });
  await test('A/F: desktop and 390/320px layouts, keyboard choices and visible focus retain the same routes', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [name, path] of [['home', '/'], ['types', '/exam'], ['repeat-bank', '/exam/bank/repeat'], ['interview-bank', '/exam/bank/interview'], ['daily', '/voice'], ['preparation', examPath(getBankTask(campus.setId), { questionIndex: 3 })], ['review', `/practice/review?id=${campusId}`]]) {
        await goto(path); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows at ${width}px`); await screenshot(`${name}-${width}`, false);
        if (name === 'preparation') { await begin(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await screenshot(`practice-${width}`, false); }
      }
      await goto('/'); const boxes = await page.locator('.direction-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().y)); assert.ok(boxes[1] > boxes[0]);
      await page.locator('.exam-direction').focus(); assert.notEqual(await page.locator('.exam-direction').evaluate(link => getComputedStyle(link).outlineStyle), 'none'); await page.keyboard.press('Enter'); await page.waitForURL('**/exam');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error); console.error('URL', page.url()); console.error((await page.locator('body').innerText()).slice(0,7000));
  await screenshot('failure'); throw error;
} finally {
  await fs.writeFile('docs/core-flow-2026-10-24/browser-results.json', JSON.stringify({ passed, pageErrors: errors, environment: 'Real Chrome MediaRecorder and decoding with fake microphone; controlled ASR/TTS/AI; isolated local account and media API. Hardware microphone, live recognition/TTS voices and production AI quality are not verified.' }, null, 2));
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
}
process.exit(0);
