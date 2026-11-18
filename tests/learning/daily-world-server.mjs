// Isolated contract fixture, never imported by application code. Responses are
// deliberately labelled; no real provider quality is implied by these tests.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_ENGINEERING_FIXTURE = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-daily-world-'));
process.env.BACKEND_PORT ||= '8828';
process.env.SPEAKNOW_ORIGIN ||= 'http://127.0.0.1:5228';
process.env.OPENAI_API_KEY = 'fixture-only-not-a-key';
process.env.DEEPSEEK_API_KEY = 'fixture-only-not-a-key';
process.env.LLM_PROVIDER = 'openai';
// Repeated browser runs share this isolated server; production limits remain
// unchanged. Synthetic requests still consume the normal per-user counters.
process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET = '100000000';
process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET = '10000000';
const logFile = 'docs/daily-world-2026-10-25/fixture-requests.jsonl';
await fs.mkdir(path.dirname(logFile), { recursive: true });
await fs.writeFile(logFile, '');
globalThis.fetch = async (url, options) => {
  if (!String(url).endsWith('/chat/completions')) throw new Error('Fixture refuses external network');
  const request = JSON.parse(options.body), system = request.messages[0].content, input = request.messages[1].content;
  await fs.appendFile(logFile, JSON.stringify({ system, input, at: new Date().toISOString() }) + '\n');
  const latest = input.split('Latest user message: ').at(-1).trim();
  const parsed = system.includes('TRANSCRIPT ONLY') ? { summary: 'Fixture review only.', strengths: [], improvements: [] } : {
    reply: `Fixture reply to “${latest.slice(0, 80)}”. What would you like to check next?`,
    feedback: { grammar: '', vocabulary: '', pronunciation: '', task: 'Fixture response; no performance assessment.' },
  };
  if (request.stream) return new Response(`data: ${JSON.stringify({choices:[{delta:{content:parsed.reply},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`, {headers:{'Content-Type':'text/event-stream'}});
  return { ok: true, json: async () => ({ model: 'context-contract-fixture', choices: [{ message: { content: JSON.stringify(parsed) } }] }) };
};
await import('../../backend/server.js');
