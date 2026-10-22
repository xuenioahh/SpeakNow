// Isolated engineering server. Provider responses are synthetic fixtures, never paid calls.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture } from '../impact/fixtures.js';
const noModel = process.argv.includes('--without-model');
process.env.BACKEND_PORT = noModel ? '8787' : '8793';
process.env.SPEAKNOW_ORIGIN = noModel ? 'http://127.0.0.1:5190' : 'http://127.0.0.1:5193';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-core-loop-'));
process.env.FORCE_LOCAL_DATA = 'true';
process.env.OPENAI_API_KEY = noModel ? '' : 'engineering-fixture-not-a-real-key';
for (const key of ['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'ZHIPU_API_KEY', 'LONGCAT_API_KEY', 'PARTNER_API_KEY']) process.env[key] = '';
process.env.LLM_PROVIDER = 'openai';
process.env.SPEAKNOW_IMPACT_MODEL = 'fixture-core-loop';
process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET = '6000000';
process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET = '100000000';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://api.openai.com/v1/responses') {
    const request = JSON.parse(options.body), input = JSON.parse(request.input);
    const result = input.mode === 'compare' ? {
      improvementStatus: 'Improved', explanation: 'Synthetic engineering response exercises the comparison UI; it is not learning evidence.', targetAddressed: true, coreMessagePreserved: true, newMajorIssue: false,
      beforeEvidence: input.originalText, afterEvidence: input.transcript, accuracyNote: 'Engineering fixture; not factual verification.', audienceFit: 'Engineering fixture; not a human judgement.', remainingIssue: '',
    } : fixture(input.transcript, input.transcript.includes('NO_PRIORITY_TEST') ? null : 'Unsupported Claim');
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }], usage: { input_tokens: 50, output_tokens: 100 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (/openai\.com|openrouter\.ai|deepseek\.com|bigmodel\.cn|longcat/.test(String(url))) return new Response('{}', { status: 503 });
  return originalFetch(url, options);
};
console.log(noModel ? 'ISOLATED ENGINEERING DATA. No model keys; actual unavailable-provider responses. No paid calls.' : 'ISOLATED ENGINEERING DATA. Generated audio, controlled ASR and synthetic provider. No real effectiveness or purchases.');
await import('../../backend/server.js');
