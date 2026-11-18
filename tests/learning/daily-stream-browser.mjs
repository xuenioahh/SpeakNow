import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:15211';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('textbox', { name: 'Your reply' }).waitFor();
  const reply = 'Engineering fixture: would you like a small or large coffee?';
  for (const [index, words] of ['A small oat milk coffee, please.', 'Could you make it iced?'].entries()) {
    await page.getByRole('textbox', { name: 'Your reply' }).fill(words);
    await page.getByRole('button', { name: 'Send reply' }).click();
    try { await page.getByText(reply, { exact: true }).first().waitFor(); }
    catch (error) { console.error('Daily stream page state:', (await page.locator('body').innerText()).slice(-1300), errors); throw error; }
  }
  await page.getByText('Earlier conversation (2 turns)').waitFor();
  assert.equal(await page.getByText(reply, { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: two Daily conversation turns complete through SSE fixture without a page error.');
} finally { await browser.close(); }
