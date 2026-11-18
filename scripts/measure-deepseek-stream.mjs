// Uses real, billable DeepSeek requests when DEEPSEEK_API_KEY is configured.
import './load-server-env.mjs';
import fs from 'node:fs';
import { checkProviderHealth, streamConversationReply } from '../api/_llm.js';

if (process.env.SPEAKNOW_KEY_FILE) {
  const file = process.env.SPEAKNOW_KEY_FILE;
  if (fs.statSync(file).mode & 0o077) throw new Error('credential_file_permissions_invalid');
  process.env.DEEPSEEK_API_KEY = fs.readFileSync(file, 'utf8').trim();
  fs.unlinkSync(file);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.log(JSON.stringify({ provider: 'deepseek', configured: false, measurements: 0 }));
  process.exitCode = 1;
} else {
  const inputs = [
    'I would like a small coffee.',
    'Could you make it iced?',
    'Oat milk would be great.',
    'How long will it take?',
    'Thank you, that is everything.',
  ];
  const requested = Number(process.argv.find(arg => arg.startsWith('--samples='))?.split('=')[1] || 5);
  const sampleCount = Number.isInteger(requested) && requested >= 2 && requested <= 30 ? requested : 5;
  const results = [];
  const before = await checkProviderHealth();
  const systemText = 'You are a barista in the same café, serving the same customer. Reply naturally in one short sentence. Do not coach.';
  for (let index = 0; index < sampleCount; index += 1) {
    const userText = inputs[index % inputs.length];
    try {
      const result = await streamConversationReply({ systemText, userText, timeoutMs: 12000 });
      results.push({ ok: true, firstTokenMs: result.firstTokenMs, totalMs: result.totalMs, inputTokens: result.usage?.prompt_tokens || 0, outputTokens: result.usage?.completion_tokens || 0 });
    } catch (error) { results.push({ ok: false, code: error.code || 'connection_failed' }); }
  }
  const statistic = (key, fraction) => {
    const values = results.filter(item => item.ok).map(item => item[key]).sort((a, b) => a - b);
    return values.length && (fraction < .95 || values.length >= 20) ? values[Math.ceil(values.length * fraction) - 1] : null;
  };
  const successful = results.filter(item => item.ok);
  const after = await checkProviderHealth();
  const balanceDelta = before.currencies?.[0] && after.currencies?.[0] && before.currencies[0].currency === after.currencies[0].currency ? Number(before.currencies[0].total) - Number(after.currencies[0].total) : null;
  console.log(JSON.stringify({ provider: 'deepseek', model: process.env.DEEPSEEK_CONVERSATION_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-flash', requests: results.length, successful: successful.length, failed: results.length - successful.length, p95Status: successful.length < 20 ? 'insufficient_sample_size' : 'descriptive_only', firstTokenMs: { mean: successful.length ? Math.round(successful.reduce((sum, item) => sum + item.firstTokenMs, 0) / successful.length) : null, p50: statistic('firstTokenMs', .5), p95: statistic('firstTokenMs', .95) }, totalMs: { mean: successful.length ? Math.round(successful.reduce((sum, item) => sum + item.totalMs, 0) / successful.length) : null, p50: statistic('totalMs', .5), p95: statistic('totalMs', .95) }, inputTokens: successful.reduce((sum, item) => sum + item.inputTokens, 0), outputTokens: successful.reduce((sum, item) => sum + item.outputTokens, 0), balanceDelta: Number.isFinite(balanceDelta) ? { currency: before.currencies[0].currency, amount: Number(balanceDelta.toFixed(6)) } : null, errors: results.filter(item => !item.ok).map(item => item.code) }));
  delete process.env.DEEPSEEK_API_KEY;
  if (successful.length !== sampleCount) process.exitCode = 1;
}
