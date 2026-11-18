import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const credentials = JSON.parse(await fs.readFile('data/testing-account.local', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=/private/tmp/speaknow-asr-check.wav'] });
const page = await browser.newPage();
page.setDefaultTimeout(100000);
const report = { scope: 'Real browser MediaRecorder → real local ASR → real DeepSeek. Synthesized file microphone; NOT human microphone or audible TTS acceptance.', errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
try {
  await page.goto(credentials.url);
  await page.locator('input[name=email]').fill(credentials.email);
  await page.locator('input[name=password]').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/membership');
  await page.goto('http://localhost:5173/voice/chat?scenario=cafe&cue=menu&camera=off&clip=off');
  await page.getByRole('button', { name: 'Turn voice off', exact: true }).click();
  await page.getByRole('button', { name: 'Record one reply', exact: true }).click();
  await page.getByText('Listening to you', { exact: true }).waitFor();
  await page.waitForTimeout(5500);
  const transcription = page.waitForResponse(response => response.url().endsWith('/api/local-transcription'));
  const conversation = page.waitForResponse(response => response.url().endsWith('/api/speaking-feedback') && response.request().postDataJSON()?.action === 'conversation_stream');
  await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
  const response = await transcription;
  report.transcription = await response.json();
  assert.equal(response.status(), 200);
  assert.match(report.transcription.text, /cup of tea/i);
  const stream = await (await conversation).text();
  assert.match(stream, /event: done/);
  const done = JSON.parse(stream.split('\n\n').find(value => value.startsWith('event: done')).split('\ndata: ')[1]);
  assert.equal(done.provider, 'deepseek');
  report.reply = done.reply; report.usage = done.usage;
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1; }
finally { await fs.writeFile('docs/industrial-audit-2026-11-10/local-asr-browser.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
