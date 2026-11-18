import test from 'node:test';
import assert from 'node:assert/strict';
import { streamConversationReply, normalizeDeepSeekModel, checkProviderHealth } from '../../api/_llm.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;
function mockStream(events) {
  return { ok: true, body: new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(new TextEncoder().encode(event)); controller.close(); } }) };
}
test('DeepSeek legacy model maps to Flash and streaming waits for a complete answer', async () => {
  process.env.DEEPSEEK_API_KEY = 'fixture-only';
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); sent.push(body);
    return mockStream([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'A small' } }] })}\r\n\r\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ' coffee, please.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 6 } })}\r\n\r\n`,
      'data: [DONE]\r\n\r\n',
    ]);
  };
  try {
    assert.equal(normalizeDeepSeekModel('deepseek-chat'), 'deepseek-flash');
    const deltas = [];
    const result = await streamConversationReply({ systemText: 'Barista', userText: 'Coffee', onDelta: text => deltas.push(text) });
    assert.equal(result.reply, 'A small coffee, please.');
    assert.deepEqual(deltas, ['A small', ' coffee, please.']);
    assert.equal(sent[0].thinking.type, 'disabled');
    assert.equal(sent[0].stream_options.include_usage, true);
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
test('incomplete stream and depleted balance cannot count as success', async () => {
  process.env.DEEPSEEK_API_KEY = 'fixture-only';
  try {
    globalThis.fetch = async () => mockStream([`data: ${JSON.stringify({ choices: [{ delta: { content: 'Partial' } }] })}\n\n`]);
    await assert.rejects(streamConversationReply({ systemText: 'Barista', userText: 'Coffee' }), /provider_stream_incomplete/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ is_available: false, balance_infos: [{ currency: 'USD', total_balance: '0.00' }] }) });
    const health = await checkProviderHealth({ probe: true });
    assert.equal(health.balance, 'insufficient');
    assert.equal(health.model, 'not_checked');
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
test('provider status and timeout are distinguishable without leaking response bodies', async () => {
  process.env.DEEPSEEK_API_KEY = 'fixture-only';
  try {
    for (const [status, code] of [[401, 'provider_key_invalid'], [402, 'provider_balance_insufficient'], [429, 'provider_rate_limited'], [503, 'provider_unavailable']]) {
      globalThis.fetch = async () => ({ ok: false, status });
      await assert.rejects(streamConversationReply({ systemText: 'Barista', userText: 'Coffee' }), error => error.status === status && error.code === code && !error.message.includes('fixture-only'));
    }
    globalThis.fetch = async (_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    await assert.rejects(streamConversationReply({ systemText: 'Barista', userText: 'Coffee', timeoutMs: 10 }), error => error.name === 'AbortError');
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
