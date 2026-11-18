import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5241';
const output = process.env.SPEAKNOW_TEST_OUTPUT || 'docs/industrial-audit-2026-11-10';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], receipts = [], reads = [], turns = [];
const report = { category: 'Real API integration + real browser, synthetic typed learner input', devices: 'Microphone and camera off; TTS disabled using the product control, not mocked', production: 'No deployment; isolated local server data only', turns, receipts, errors };
const prompts = [
  'I prefer tea because coffee makes me nervous. What would you recommend?',
  'Something without caffeine, please. I do not want any sugar either.',
  'I usually drink tea with my friend Maya on Sundays.',
  'Actually, can we talk about a train trip to the coast instead?',
  'I want to sketch buildings there. What should I bring?',
  'What could I do if it rains all day?',
  'Maya cannot join this time; my brother Leo will come instead.',
  'Who is coming with me now, and who cannot come?',
  'What drink did I say I preferred, and why?',
  'The order is sorted, but I would like to keep chatting about travel. What interests you about old train stations?',
];
page.setDefaultTimeout(60000);
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (!response.url().endsWith('/api/speaking-feedback')) return;
  if (response.request().postDataJSON()?.action !== 'conversation_stream') return;
  reads.push(response.text().then(body => {
    const events = body.split('\n\n');
    const done = events.find(event => event.startsWith('event: done'));
    receipts.push(done ? JSON.parse(done.split('\ndata: ')[1]) : { httpStatus: response.status(), failed: true });
  }).catch(() => receipts.push({ failed: true })));
});
try {
  await fs.mkdir(output, { recursive: true });
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off`);
  await page.getByRole('button', { name: 'Turn voice off', exact: true }).click();
  for (const [index, userText] of prompts.entries()) {
    const started = Date.now();
    await page.getByRole('textbox', { name: 'Your reply', exact: true }).fill(userText);
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await page.waitForFunction(expected => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).some(key => JSON.parse(localStorage.getItem(key)).messages?.filter(message => message.source === 'ai').length === expected), index + 1);
    const messages = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).map(key => JSON.parse(localStorage.getItem(key))).find(value => value.messages)?.messages);
    assert.equal(messages.filter(message => message.role === 'user').length, index + 1);
    const reply = messages.filter(message => message.source === 'ai').at(-1);
    assert.ok(reply.model?.startsWith('deepseek'));
    turns.push({ turn: index + 1, userText, reply: reply.content, model: reply.model, browserRoundTripMs: Date.now() - started });
    await fs.writeFile(`${output}/real-browser.json`, JSON.stringify({ ...report, status: 'running' }, null, 2));
    console.log(`Real browser/provider turn ${index + 1}/10 complete`);
  }
  assert.equal(new Set(turns.map(turn => turn.reply)).size, 10);
  assert.match(turns[7].reply, /Leo/); assert.match(turns[7].reply, /Maya/);
  assert.match(turns[8].reply, /tea/i); assert.match(turns[8].reply, /nervous|caffeine|coffee/i);
  await page.screenshot({ path: `${output}/real-daily-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Finish & review', exact: true }).click();
  await page.waitForURL('**/practice/review?id=*');
  await page.getByRole('button', { name: 'Get feedback', exact: true }).click();
  await page.locator('.review-summary').waitFor();
  const saved = await page.evaluate(async () => (await import('/src/lib/learningStore.js')).learningStore.get('attempts', new URLSearchParams(location.search).get('id')));
  assert.equal(saved.answers.length, 10); assert.equal(saved.feedback.source, 'ai'); assert.equal(saved.feedback.provider, 'deepseek');
  assert.ok(saved.feedback.improvements.every(item => saved.answers[item.answerIndex].text.includes(item.quote)));
  await page.reload(); await page.locator('.review-summary').waitFor();
  assert.equal(await page.locator('.review-summary').innerText(), saved.feedback.summary);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 640 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/real-review-${width}.png`, fullPage: true });
  }
  await Promise.all(reads);
  assert.equal(receipts.length, 10); assert.ok(receipts.every(value => value.usage && !value.failed));
  assert.deepEqual(errors, []);
  report.feedback = saved.feedback;
  report.persistence = 'IndexedDB refresh verified, not Supabase';
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message;
  report.visibleState = (await page.locator('body').innerText().catch(() => '')).slice(-1800);
  console.error(error.message); process.exitCode = 1;
} finally {
  await Promise.allSettled(reads);
  await fs.writeFile(`${output}/real-browser.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
