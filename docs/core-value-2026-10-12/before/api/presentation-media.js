import { randomUUID } from 'node:crypto';
import { protectedApi } from './_apiGuard.js';
import { getOwned, updateImpact } from './_appStore.js';
import { mediaObject } from './_mediaStore.js';

export async function mediaHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {}, owner = req.user.id;
  const session = await getOwned('presentationSessions', owner, body.sessionId);
  if (!session?.report?.impact) return res.status(404).json({ error: 'Practice not found' });
  const impact = session.report.impact;
  if (body.action === 'read') {
    const recording = impact.recordings.find(item => item.id === body.recordingId);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    const data = await mediaObject(`${owner}/${session.id}/${recording.id}`);
    return res.status(200).json({ dataUrl: `data:${recording.mime};base64,${data.toString('base64')}` });
  }
  if (body.action !== 'save' || typeof body.dataUrl !== 'string' || body.dataUrl.length > 14000000) return res.status(400).json({ error: 'Recording exceeds the 10 MB upload limit or is invalid.' });
  const match = body.dataUrl.match(/^data:((?:audio|video)\/(?:webm|mp4|ogg));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ error: 'Unsupported recording format' });
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 10 * 1024 * 1024 || impact.recordings.length >= 20) return res.status(400).json({ error: 'Recording storage limit reached.' });
  const id = randomUUID(), key = `${owner}/${session.id}/${id}`;
  await mediaObject(key, { method: 'POST', data, mime: match[1] });
  try {
    await updateImpact(owner, session.id, 'append', { recording: { id, mime: match[1], bytes: data.length, source: impact.inputSource } });
  } catch (error) { await mediaObject(key, { method: 'DELETE' }); throw error; }
  return res.status(200).json({ recordingId: `${session.id}:${id}` });
}
export default protectedApi(mediaHandler);
