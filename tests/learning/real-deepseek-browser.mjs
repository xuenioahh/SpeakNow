// Real DeepSeek route acceptance; the user input is typed, browser TTS is controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(35000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Controlled browser voice' }], addEventListener() {}, resume() {}, cancel() {}, speak(utterance) { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 50); } } });
  });
  const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://localhost:5173';
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off`, { waitUntil: 'domcontentloaded' });
  const draft = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).map(key => JSON.parse(localStorage.getItem(key))).find(value => value.messages));
  for (const [index, words] of ['I would like a small cappuccino with oat milk, please.', 'Please make it iced and do not add sugar.'].entries()) {
    await page.getByRole('textbox', { name: 'Your reply' }).fill(words);
    await page.getByRole('button', { name: 'Send reply' }).click();
    try { await page.waitForFunction(expected => Object.keys(localStorage).filter(key => key.startsWith('speaknow-voice-draft:')).map(key => JSON.parse(localStorage.getItem(key))).some(value => value.messages?.filter(message => message.model === 'deepseek-flash').length >= expected), index + 1); }
    catch (error) { console.error('Real route browser state:', (await page.locator('body').innerText()).slice(-1300), await draft(), errors); throw error; }
  }
  const messages = (await draft()).messages;
  const replies = messages.filter(message => message.model === 'deepseek-flash').map(message => message.content);
  assert.equal(replies.length, 2);
  assert.notEqual(replies[0], replies[1]);
  assert.match(replies[0], /coffee|cappuccino|milk/i);
  assert.match(replies[1], /ice|iced|sugar|sweet/i);
  await page.getByRole('button', { name: 'Finish & review' }).click();
  await page.waitForURL('**/practice/review?id=*');
  await page.getByRole('button', { name: 'Get AI feedback' }).click();
  await page.getByText('Feedback ready.').waitFor();
  const id = new URL(page.url()).searchParams.get('id');
  const feedback = await page.evaluate(async id => { const { learningStore } = await import('/src/lib/learningStore.js'); return (await learningStore.get('attempts', id))?.feedback; }, id);
  assert.equal(feedback.source, 'ai');
  assert.equal(feedback.provider, 'deepseek');
  assert(feedback.improvements.every(item => messages.filter(message => message.role === 'user').some(message => message.content.includes(item.quote))));
  assert.deepEqual(errors, []);
  const result = { realProvider: feedback.provider, conversationModel: messages.find(message => message.model)?.model, feedbackModel: feedback.model, replies, feedbackSummary: feedback.summary, improvements: feedback.improvements.length, browserAsr: 'not_tested', voice: 'controlled_browser_tts' };
  await fs.mkdir('docs/ui-restoration-2026-10-31', { recursive: true });
  await fs.writeFile('docs/ui-restoration-2026-10-31/real-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
