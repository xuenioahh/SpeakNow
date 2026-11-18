import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:15215';
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('https://fonts.googleapis.com/**', route => route.abort());
await context.route('https://fonts.gstatic.com/**', route => route.abort());
await context.route('**/api/local-data', async route => {
  const request = route.request().postDataJSON();
  const today = new Date().toISOString();
  const account = { id: 'profile-test-user', full_name: 'Profile Test', email: 'profile@example.test', profile_preferences: { weekly_goal: 3, practice_focus: 'voice' } };
  const voice = [{ id: 'daily-one', created_date: today, report: { source: 'unavailable', learning: {
    id: 'daily-one', ownerId: account.id, track: 'daily', title: 'Café · Ordering', createdAt: today,
    answers: [{ text: 'A coffee please', recordingId: 'audio-one', durationSeconds: 15 }],
  } } }];
  const data = request.action === 'me' ? account : request.action === 'listEntity' ? request.entity === 'VoiceSession' ? voice : [] : null;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
});
try {
  await page.goto(`${origin}/profile`);
  await page.getByRole('heading', { name: 'Profile & progress' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Score trends unavailable' }).count(), 1);
  assert.equal(await page.getByText('1 of 1 sessions have a recorded duration').count(), 1);
  assert.equal(await page.getByRole('link', { name: /Café · Ordering/ }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, viewport: 'desktop and mobile', source: 'controlled profile API fixture' }));
} finally {
  await browser.close();
}
