import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const credentials = JSON.parse(await fs.readFile('data/testing-account.local', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(credentials.url);
  await page.locator('input[name=email]').fill(credentials.email);
  await page.locator('input[name=password]').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/membership');
  await page.getByText(/Unlimited local testing · no practice/).waitFor();
  await page.reload();
  await page.getByText(/Unlimited local testing · no practice/).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  console.log('PASS actual browser login, authenticated reload, local unlimited membership');
} finally { await browser.close(); }
