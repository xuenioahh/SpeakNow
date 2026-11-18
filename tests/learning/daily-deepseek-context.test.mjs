import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../../api/voice-chat.js';

function response() {
  return { code: 200, chunks: [], setHeader() {}, flushHeaders() {}, write(value) { this.chunks.push(value); }, end() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
}
test('two streamed turns preserve the same café task, NPC role and actual conversation history', async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = 'fixture-only';
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const reply = requests.length === 1 ? 'Would you like oat milk?' : 'Of course. One small iced oat milk coffee.';
    const events = [`data: ${JSON.stringify({ choices: [{ delta: { content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 9 } })}\n\n`, 'data: [DONE]\n\n'];
    return { ok: true, body: new ReadableStream({ start(controller) { for (const value of events) controller.enqueue(new TextEncoder().encode(value)); controller.close(); } }) };
  };
  try {
    const first = response();
    await handler({ method: 'POST', body: { action: 'conversation_stream', scenario: { id: 'cafe' }, sceneCueId: 'menu', userText: 'A small coffee please.', history: [] } }, first);
    const second = response();
    await handler({ method: 'POST', body: { action: 'conversation_stream', scenario: { id: 'cafe' }, sceneCueId: 'menu', userText: 'Yes, oat milk please.', history: [{ role: 'user', content: 'A small coffee please.' }, { role: 'ai', content: 'Would you like oat milk?' }] } }, second);
    assert.equal(first.code, 200); assert.equal(second.code, 200);
    assert.match(first.chunks.join(''), /event: done/);
    assert.match(second.chunks.join(''), /event: done/);
    assert.match(requests[0].messages[0].content, /Conversation ID: menu/);
    assert.match(requests[0].messages[0].content, /Barista/);
    assert.match(requests[1].messages[1].content, /Would you like oat milk\?/);
    assert.match(requests[1].messages[1].content, /Yes, oat milk please\./);
    assert.equal(requests[0].thinking.type, 'disabled');
  } finally { globalThis.fetch = priorFetch; if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = priorKey; }
});
test('without DeepSeek credentials a turn fails explicitly and retains no fake reply', async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const res = response();
    await handler({ method: 'POST', body: { action: 'conversation_stream', scenario: { id: 'cafe' }, sceneCueId: 'menu', userText: 'Hello.' } }, res);
    assert.equal(res.code, 503);
    assert.equal(res.value.code, 'no_deepseek_api_key_configured');
    assert.equal(res.chunks.length, 0);
  } finally { if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = priorKey; }
});
