import { checkOrigin, cookies, authenticate } from './_auth.js';
import { localTranscriptionAvailable, transcribeLocalAudio } from './_localTranscription.js';

export default async function handler(req, res) {
  const controller = new AbortController();
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  try {
    checkOrigin(req);
    const address = req.socket?.remoteAddress;
    if (!localTranscriptionAvailable() || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return res.status(404).json({ error: 'Local transcription is unavailable.' });
    if (req.method !== 'POST' || !String(req.headers?.['content-type'] || '').includes('application/json')) return res.status(405).json({ error: 'Use a JSON POST request.' });
    if (cookies(req).speaknow_session) await authenticate(req);
    const data = req.body?.data;
    if (typeof data !== 'string' || data.length < 4 || data.length > 5592408 || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || Buffer.from(data, 'base64').toString('base64') !== data) return res.status(400).json({ error: 'Invalid audio recording.' });
    res.setHeader('Cache-Control', 'no-store');
    res.on?.('close', closed);
    const result = await transcribeLocalAudio(data, { signal: controller.signal });
    if (!controller.signal.aborted) return res.status(200).json(result);
  } catch (error) {
    if (!controller.signal.aborted && !res.headersSent) return res.status(error.status || 503).json({ error: error.status ? error.message : 'Transcription failed. Your recording is saved.', code: error.code || 'transcription_failed' });
  } finally { res.off?.('close', closed); }
}
