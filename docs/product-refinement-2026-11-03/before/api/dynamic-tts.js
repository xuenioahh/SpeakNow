import { performance } from 'node:perf_hooks';
import { requestContext } from './_requestContext.js';
import { trialApi } from './_trialGuard.js';

export async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const text = String(req.body?.text || '').trim();
  if (!text || text.length > 600) return res.status(400).json({ error: 'Voice text must be 1–600 characters.' });
  if (process.env.SPEAKNOW_DYNAMIC_TTS !== 'elevenlabs' || !process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) return res.status(503).json({ error: 'High-quality NPC voice is unavailable. The reply remains readable.', code: 'tts_not_configured' });
  const controller = new AbortController();
  req.on?.('aborted', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(new Error('tts_timeout')), 20000);
  const started = performance.now();
  let firstAudioMs = null, bytes = 0, completed = false;
  const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}/stream?output_format=mp3_44100_128`, {
      method: 'POST', signal: controller.signal,
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('audio/')) {
      const code = response.status === 401 ? 'tts_key_invalid' : response.status === 402 ? 'tts_balance_insufficient' : response.status === 429 ? 'tts_rate_limited' : 'tts_provider_failed';
      return res.status(response.status === 401 || response.status === 402 || response.status === 429 ? response.status : 503).json({ error: 'NPC voice could not be generated. The reply remains readable.', code });
    }
    const context = requestContext.getStore();
    if (context) { context.aiUsage ||= {}; context.aiUsage.ttsCharacters = text.length; }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    for await (const chunk of response.body) {
      if (controller.signal.aborted) break;
      if (firstAudioMs === null) firstAudioMs = Math.round(performance.now() - started);
      bytes += chunk.byteLength;
      res.write(Buffer.from(chunk));
    }
    completed = !controller.signal.aborted && bytes > 0;
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(503).json({ error: 'NPC voice could not be generated. The reply remains readable.', code: error?.name === 'AbortError' ? 'tts_timeout' : 'tts_provider_failed' });
    else res.end();
  } finally {
    clearTimeout(timeout);
    console.info('dynamic_tts', JSON.stringify({ provider: 'elevenlabs', model, characters: text.length, firstAudioMs, totalMs: Math.round(performance.now() - started), bytes, success: completed }));
  }
}

export default trialApi(handler);
