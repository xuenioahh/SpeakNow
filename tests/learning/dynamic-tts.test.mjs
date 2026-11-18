import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../../api/dynamic-tts.js';

function response() {
  return { statusCode: 200, headers: {}, chunks: [], ended: false,
    get headersSent() { return this.chunks.length > 0 || this.ended; },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.value = value; this.ended = true; return this; },
    write(chunk) { this.chunks.push(chunk); },
    end() { this.ended = true; },
  };
}
test('dynamic TTS refuses unconfigured requests without synthetic audio', async () => {
  const old = process.env.SPEAKNOW_DYNAMIC_TTS;
  delete process.env.SPEAKNOW_DYNAMIC_TTS;
  try {
    const res = response();
    await handler({ method: 'POST', body: { text: 'Hello.' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.value.code, 'tts_not_configured');
    assert.equal(res.chunks.length, 0);
  } finally { if (old === undefined) delete process.env.SPEAKNOW_DYNAMIC_TTS; else process.env.SPEAKNOW_DYNAMIC_TTS = old; }
});
test('dynamic TTS streams real provider bytes and classifies provider errors', async () => {
  const previous = Object.fromEntries(['SPEAKNOW_DYNAMIC_TTS', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'].map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.SPEAKNOW_DYNAMIC_TTS = 'elevenlabs';
  process.env.ELEVENLABS_API_KEY = 'fixture-only';
  process.env.ELEVENLABS_VOICE_ID = 'fixture-voice';
  try {
    let request;
    globalThis.fetch = async (_url, options) => { request = options; return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.from([1, 2, 3])); controller.enqueue(Uint8Array.from([4, 5])); controller.close(); } }) }; };
    const res = response();
    await handler({ method: 'POST', body: { text: 'Hello from the café.' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.deepEqual([...Buffer.concat(res.chunks)], [1, 2, 3, 4, 5]);
    assert.equal(JSON.parse(request.body).text, 'Hello from the café.');
    globalThis.fetch = async () => ({ ok: false, status: 401, headers: { get: () => 'application/json' } });
    const denied = response();
    await handler({ method: 'POST', body: { text: 'Hello.' } }, denied);
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.value.code, 'tts_key_invalid');
    assert.equal(denied.chunks.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
