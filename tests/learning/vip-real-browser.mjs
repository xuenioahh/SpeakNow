import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const credentials = JSON.parse(await fs.readFile('data/testing-account.local', 'utf8'));
const origin = 'http://localhost:5173';
const output = 'docs/industrial-audit-2026-11-10';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const report = { category: 'Real browser, real local account and one real DeepSeek text call; no microphone/TTS/payment/cloud test', passed: [], errors: [] };
page.setDefaultTimeout(60000);
page.on('pageerror', error => report.errors.push(error.message));
try {
  await page.goto(credentials.url);
  await page.locator('input[type=email]').fill(credentials.email);
  await page.locator('input[type=password]').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/membership');
  await page.getByText(/Unlimited local testing · no practice/).waitFor();
  report.passed.push('Provisioned account signs in and has explicit local unlimited allowance');
  await page.goto(`${origin}/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off`);
  await page.getByRole('button', { name: 'Turn voice off', exact: true }).click();
  const pending = page.waitForResponse(response => response.url().endsWith('/api/speaking-feedback') && response.request().postDataJSON()?.action === 'conversation_stream');
  await page.getByRole('textbox', { name: 'Your reply', exact: true }).fill('I am testing this speaking app. Could you suggest one caffeine-free drink for a rainy afternoon?');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  const response = await pending;
  const stream = await response.text();
  const event = stream.split('\n\n').find(value => value.startsWith('event: done'));
  assert.ok(event, 'Actual provider completion required');
  const receipt = JSON.parse(event.split('\ndata: ')[1]);
  assert.equal(receipt.provider, 'deepseek'); assert.ok(receipt.usage.prompt_tokens > 0);
  report.receipt = { model: receipt.model, usage: receipt.usage, firstTokenMs: receipt.firstTokenMs, totalMs: receipt.totalMs };
  await page.getByRole('button', { name: 'Finish & review', exact: true }).click();
  await page.waitForURL('**/practice/review?id=*');
  await page.goto(`${origin}/membership`);
  await page.getByLabel('Actual token usage').getByText('Models and calculation').waitFor();
  const data = await page.evaluate(async () => {
    const { apiJson } = await import('/src/api/http.js');
    const status = await apiJson('/api/membership', { action: 'status' });
    const usage = await apiJson('/api/membership', { action: 'usage', userId: 'cannot-select-another-user' });
    let denied;
    try { await apiJson('/api/membership', { action: 'admin-grant', userId: 'cannot-upgrade', days: 365 }); } catch (error) { denied = error.status; }
    return { unlimited: status.unlimitedTesting, payments: status.paymentsEnabled, total: usage.total, fixtureRuns: usage.fixturesExcluded, adminDenied: denied, prices: usage.prices };
  });
  assert.equal(data.unlimited, true); assert.equal(data.payments, false); assert.equal(data.adminDenied, 403);
  assert.ok(data.total.inputTokens >= receipt.usage.prompt_tokens); assert.equal(data.fixtureRuns, 0);
  report.usage = data;
  report.passed.push('Real provider receipts appear in the owning account; learner admin grant rejected');
  await page.getByLabel('Request type').selectOption('more-practice');
  await page.getByLabel('Optional note').fill('Local test of recharge enquiry; no payment authorized.');
  const send = page.getByRole('button', { name: 'Send VIP request', exact: true });
  if (await send.count()) await send.click();
  await page.getByRole('button', { name: 'Request pending', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Request pending', exact: true }).waitFor();
  report.passed.push('Recharge enquiry survives refresh and does not create payment or balance');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}px`);
    await page.screenshot({ path: `${output}/vip-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  assert.deepEqual(report.errors, []); report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1; }
finally { await fs.writeFile(`${output}/vip-real-browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ status: report.status, passed: report.passed, failure: report.failure }));
