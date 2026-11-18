import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5194';
const folder = 'docs/product-refinement-2026-11-03';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
const page = await context.newPage(), checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);
const shot = async (name, width) => {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${folder}/${name}-${width}.png`, fullPage: false, animations: 'disabled' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows at ${width}`);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
};
try {
  for (const [name, path] of [['home','/'],['exams','/exam'],['ielts','/exam/ielts'],['bank','/exam/bank/listen-repeat'],['daily','/voice'],['history','/progress?tab=history'],['insights','/progress?tab=insights'],['membership','/membership'],['auth','/auth']]) {
    await page.goto(origin + path); await page.locator('h1').first().waitFor();
    for (const width of [1280, 390, 320]) await shot(name, width);
    if (name === 'daily') {
      await page.locator('.daily-scenario').last().scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.daily-scenario').last().evaluate(node => node.getBoundingClientRect().bottom <= innerHeight + 1));
      await page.screenshot({ path: `${folder}/daily-scrolled-320.png`, animations: 'disabled' });
    }
    checks.push(`${name}: desktop, 390px, 320px`);
  }
  await page.goto(origin + '/auth');
  const registered = await page.evaluate(async () => {
    const credentials = { email: 'speech-admin-fixture@example.invalid', full_name: 'Fixture admin', password: 'browser-admin-fixture-password' };
    const send = action => fetch('/api/local-data', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({action, ...credentials}) });
    let response = await send('register'); if (response.status === 409) response = await send('login');
    return { status: response.status, body: await response.json() };
  });
  assert.equal(registered.status, 200); assert.equal(registered.body.data.role, 'admin');
  for (const [name, path] of [['account','/profile'],['presentation','/presentation'],['expression','/voice/casual-video']]) {
    await page.goto(origin + path); await page.locator('h1').first().waitFor();
    for (const width of [1280, 390, 320]) await shot(name, width);
    checks.push(`${name}: desktop, 390px, 320px`);
  }
  await page.goto(origin + '/admin');
  await page.getByRole('heading', { name:'Usage & pricing', exact:true }).waitFor();
  await page.locator('.usage-summary').waitFor();
  const report = await page.evaluate(async () => { const { apiJson } = await import('/src/api/http.js'); return apiJson('/api/membership', { action:'admin-usage', days:30 }); });
  assert.equal(report.total.inputTokens, 0, 'fixture calls never become measured token totals');
  assert.ok(!JSON.stringify(report).includes('conversationHistory'));
  await page.getByText('VIP monthly & recharge calculator', {exact:true}).click();
  assert.match(await page.locator('.pricing-result').innerText(), /Fill in/);
  const values = { llmPerMinute: '.002', ttsCharactersPerMinute:'300', exchangeRate:'7', fixedMonthly:'100', freeSubsidy:'20', otherPerUser:'3' };
  const labels = { llmPerMinute:/^Model cost \/ minute/, ttsCharactersPerMinute:/^Paid TTS characters \/ minute/, exchangeRate:/^USD → CNY/, fixedMonthly:/^Hosting, database/, freeSubsidy:/^Free users/, otherPerUser:/^Exams, refunds/ };
  for (const [key,value] of Object.entries(values)) await page.getByLabel(labels[key]).fill(value);
  assert.match(await page.locator('.pricing-result').innerText(), /Monthly VIP price/);
  for (const width of [1280,390,320]) await shot('admin-pricing',width);
  checks.push('admin-only actual ledger report and configurable monthly/recharge calculator');
  const anon = await browser.newContext(), guest = await anon.newPage(); await guest.goto(origin);
  const rejected = await guest.evaluate(async () => { const response = await fetch('/api/membership', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-usage'})}); return response.status; });
  assert.equal(rejected,401); await anon.close(); checks.push('anonymous usage report rejected');
  assert.deepEqual(errors, []);
  const result = { status:'PASS', scope:'Real browser, local isolated fixture backend, API authorization, IndexedDB UI. No real voice/camera acceptance in this suite.', checks, errors };
  await fs.writeFile(`${folder}/browser.json`,JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} catch (error) {
  console.error(error); await fs.writeFile(`${folder}/browser.json`,JSON.stringify({ status:'FAIL', error:String(error), checks, errors },null,2));
  await page.screenshot({path:`${folder}/failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1;
} finally { await browser.close(); }
