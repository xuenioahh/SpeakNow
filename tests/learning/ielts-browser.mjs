import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { IELTS_QUESTION_SETS, getBankTask, examPath } from '../../shared/questionBank.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1365, height: 950 } });
const page = await context.newPage(), origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5198';
const passed = [], errors = [], output = process.env.SPEAKNOW_TEST_OUTPUT || 'docs/ielts-2026-10-29';
page.setDefaultTimeout(16000);
page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => {
  class Recognition {
    start() { setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); setTimeout(() => { const item = [{ transcript: 'I learned to save money by bringing lunch from home. It helped me pay for a new laptop.' }]; item.isFinal = true; this.onresult?.({ results: [item] }); }, 80); }, 25); }
    stop() { this.onaudioend?.(); setTimeout(() => this.onend?.(), 25); }
    abort() {}
  }
  window.SpeechRecognition = Recognition;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Fixture' }], addEventListener() {}, resume() {}, cancel() {}, speak(u) { window.__spoken = u.text; u.onstart?.(); setTimeout(() => u.onend?.(), 45); } } });
});
const find = (part, title) => IELTS_QUESTION_SETS.find(set => set.taskType === `ielts-${part}` && set.setTitle.startsWith(title));
const start = async (set, index = null) => {
  await page.goto(origin + examPath(getBankTask(set.setId), { questionIndex: index }));
  await page.getByRole('button', { name: /^Start (Practice|Exam)$/, exact: true }).click();
  await page.getByRole('button', { name: 'Record answer', exact: true }).waitFor();
};
async function record() {
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your transcript', exact: true }).waitFor();
  assert.match(await page.getByRole('textbox', { name: 'Your transcript' }).inputValue(), /save money/);
}
async function feedback() {
  await page.getByRole('button', { name: 'Finish and get feedback', exact: true }).click();
  await page.waitForURL('**/practice/review?id=*');
  await page.getByText('Engineering fixture: your answer gives a clear reason.', { exact: true }).waitFor();
}
async function test(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
try {
  await test('homepage and exam switch expose separate TOEFL and three-part IELTS banks', async () => {
    await page.goto(origin);
    await page.getByRole('link', { name: /Exam Practice/ }).click();
    await page.getByRole('heading', { name: 'TOEFL Speaking', exact: true }).waitFor();
    assert.equal(await page.locator('.task-type-card').count(), 2);
    await page.getByRole('link', { name: 'IELTS', exact: true }).click();
    await page.getByRole('heading', { name: 'IELTS Speaking', exact: true }).waitFor();
    assert.equal(await page.locator('.task-type-card').count(), 3);
    await page.screenshot({ path: `${output}/ielts-desktop.png`, fullPage: true });
  });
  const studies = find('part1', 'Studies');
  await test('Part 1 supports bilingual search, category/status filtering and a non-first question', async () => {
    await page.getByRole('link', { name: /^Part 1 / }).click();
    await page.locator('.bank-set').first().waitFor();
    assert.equal(await page.locator('.bank-set').count(), 47);
    await page.getByRole('searchbox').fill('学习');
    assert.equal(await page.locator('.bank-set').count(), 1);
    await page.getByRole('searchbox').fill('no-such-topic-zzzz');
    assert.equal(await page.locator('.bank-set').count(), 0);
    await page.getByRole('searchbox').fill('');
    await page.getByLabel('Category', { exact: true }).selectOption('New · 新题');
    assert.ok(await page.locator('.bank-set').count() > 0);
    await page.getByLabel('Category', { exact: true }).selectOption('all');
    await page.locator(`[data-set-id="${studies.setId}"] summary`).click();
    await page.locator(`[data-set-id="${studies.setId}"] ol a`).nth(4).click();
    assert.equal(new URL(page.url()).searchParams.get('questionId'), studies.questions[4].questionId);
    await page.getByRole('button', { name: 'Start Practice' }).click();
    await page.getByRole('heading', { name: studies.questions[4].questionText, exact: true }).waitFor();
    await record();
    await page.getByRole('button', { name: 'Save and exit' }).click();
    await page.waitForURL('**/exam/bank/ielts-part1');
    await page.getByLabel('Practice status').selectOption('in-progress');
    assert.equal(await page.locator('.bank-set').count(), 1);
    await page.locator('.bank-set summary').click();
    await page.locator('.bank-set ol a').nth(4).click();
    await page.getByRole('textbox', { name: 'Your transcript' }).waitFor();
    await page.reload();
    await page.getByRole('textbox', { name: 'Your transcript' }).waitFor();
    await feedback();
    const id = new URL(page.url()).searchParams.get('id');
    const saved = await page.evaluate(async id => (await (await import('/src/lib/learningStore.js')).learningStore.get('attempts', id)), id);
    assert.equal(saved.exam, 'ielts'); assert.equal(saved.answers[0].questionIndex, 4);
    assert.ok(saved.answers[0].recordingId);
    await page.getByRole('button', { name: 'Try the same task again' }).click();
    assert.equal(new URL(page.url()).searchParams.get('retry'), id);
    assert.equal(new URL(page.url()).searchParams.get('questionId'), studies.questions[4].questionId);
  });
  await test('Part 2 displays the selected cue variant, saves notes, and stops at 120 seconds', async () => {
    const food = find('part2', 'Special food');
    await start(food, 1);
    await page.getByRole('heading', { name: food.questions[1].questionText, exact: true }).waitFor();
    for (const cue of food.questions[1].cuePoints) await page.getByText(cue, { exact: true }).waitFor();
    assert.equal(await page.getByText(food.questions[0].cuePoints[1], { exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: 'Record answer', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Start 1-minute preparation' }).click();
    await page.getByRole('textbox', { name: 'Preparation notes' }).fill('Dumplings with my family at New Year');
    await page.getByRole('button', { name: 'Finish preparation early' }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Record answer')?.disabled);
    await page.reload();
    await page.getByText('Dumplings with my family at New Year', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click();
    await page.getByRole('timer').filter({ hasText: 'Recording' }).waitFor();
    assert.match(await page.getByRole('timer').innerText(), /120s|119s/);
    await page.waitForTimeout(600);
    await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 121000));
    await page.getByRole('textbox', { name: 'Your transcript' }).waitFor();
    await page.screenshot({ path: `${output}/part2-practice-desktop.png`, fullPage: true });
    await feedback();
    await page.locator('#review-practiced > details > summary').click();
    await page.getByText('Reference answer (practice example)', { exact: true }).click();
    await page.getByText(food.questions[1].referenceAnswer, { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/ielts-feedback-desktop.png`, fullPage: true });
    await page.getByRole('link', { name: /Practise related Part 3/ }).click();
    assert.equal(new URL(page.url()).searchParams.get('setId'), food.relatedSetId);
    await page.getByRole('link', { name: /Related Part 2 cue card/ }).waitFor();
  });
  await test('Part 2 one-minute preparation expires, and Part 3 completes the selected whole group', async () => {
    const saving = find('part2', 'Saving money');
    await start(saving);
    await page.getByRole('button', { name: 'Start 1-minute preparation' }).click();
    assert.match(await page.getByRole('timer').innerText(), /60s|59s/);
    await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 61000));
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Record answer')?.disabled);
    await page.getByRole('button', { name: 'Save and exit' }).click();
    const discussion = find('part3', 'A medical professional');
    await start(discussion);
    for (let index = 0; index < discussion.questions.length; index++) {
      await page.getByRole('heading', { name: discussion.questions[index].questionText, exact: true }).waitFor();
      await record();
      if (index < discussion.questions.length - 1) await page.getByRole('button', { name: 'Next Question', exact: true }).click();
    }
    await feedback();
    const id = new URL(page.url()).searchParams.get('id');
    const saved = await page.evaluate(async id => (await (await import('/src/lib/learningStore.js')).learningStore.get('attempts', id)), id);
    assert.equal(saved.answers.length, 3); assert.equal(saved.completed, true); assert.equal(saved.type, 'part3');
    assert.equal(new Set(saved.answers.map(answer => answer.recordingId)).size, 3);
  });
  await test('cross-set selections fail clearly; source-only Chinese discussions keep their wording', async () => {
    const other = find('part2', 'Saving money');
    await page.goto(`${origin}/exam/prepare?setId=${studies.setId}&questionId=${other.questions[0].questionId}&scope=question`);
    await page.getByRole('heading', { name: 'Practice unavailable' }).waitFor();
    const photo = find('part3', 'A photographer');
    await start(photo, 0);
    await page.getByRole('heading', { name: photo.questions[0].questionText, exact: true }).waitFor();
    await page.getByText('Answer in English. This source prompt is in Chinese.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Listen to question' }).count(), 0);
  });
  await test('IELTS selection, all banks, preparation and cue card fit 320/390px screens', async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['/exam/ielts', '/exam/bank/ielts-part1', '/exam/bank/ielts-part2', '/exam/bank/ielts-part3', examPath(getBankTask(find('part2', 'Saving money').setId))]) {
        await page.goto(origin + route);
        await page.locator('main h1').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${route}`);
        await page.screenshot({ path: `${output}/${route.includes('prepare') ? 'preparation' : route.split('/').at(-1)}-${width}.png`, fullPage: true });
      }
    }
  });
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error); console.log(page.url(), await page.locator('body').innerText());
  await page.screenshot({ path: `${output}/browser-failure.png`, fullPage: true });
  throw error;
} finally {
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify({ passed, pageErrors: errors, environment: 'Chrome with real MediaRecorder, fake microphone, controlled recognition/TTS and local model fixture; no live model or physical microphone claim.' }, null, 2));
  await browser.close();
}
