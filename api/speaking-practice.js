import { createHash } from 'node:crypto';
import { protectedApi } from './_apiGuard.js';
import { getOwned, listOwned, saveOwned, deleteOwned } from './_appStore.js';
import { mediaObject } from './_mediaStore.js';
import { validateAttempt, validAttemptId } from '../shared/speakingTasks.js';
const problem = (message, status = 400) => Object.assign(new Error(message), {
  status
});
const digest = data => createHash('sha256').update(data).digest('hex');
export function audioMime(bytes) {
  if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return 'audio/webm';
  if(bytes.toString('ascii',4,8)==='ftyp')return 'audio/mp4';
  if(bytes.toString('ascii',0,4)==='OggS')return 'audio/ogg';
  throw problem('Recording bytes are not a supported audio container');
}
export async function handler(req, res) {
  const {
    action,
    id
  } = req.body || {};
  const owner = req.user.id;
  if (action === 'list') return res.status(200).json((await listOwned('voiceSessions', owner)).filter(row => row.report?.learning).map(row => row.report.learning));
  if (action === 'save') {
    let attempt;
    try { attempt = validateAttempt(req.body.attempt); } catch(error) { throw problem(error.message); }
    const existing = await getOwned('voiceSessions', owner, attempt.id);
    if (existing) {
      if (JSON.stringify(validateAttempt(existing.report.learning).answers) !== JSON.stringify(attempt.answers) || existing.report?.learning?.taskId !== attempt.taskId || existing.report?.learning?.parentId !== attempt.parentId) throw problem('Saved attempts are immutable; create a retry instead.', 409);
      return res.status(200).json(existing.report.learning);
    }
    if (attempt.parentId) {
      const parent = await getOwned('voiceSessions', owner, attempt.parentId);
      if (!parent?.report?.learning || parent.report.learning.taskId !== attempt.taskId) throw problem('Save the matching original attempt before its retry.', 409);
    }
    const value = {
      ...attempt,
      feedback: null
    };
    await saveOwned('voiceSessions', owner, {
      id: attempt.id,
      created_date: new Date().toISOString(),
      scenario: attempt.context?.scenario || attempt.taskId,
      mode: attempt.context?.mode || 'exam',
      dialog_mode: attempt.type,
      scoring_standard: attempt.exam,
      messages: attempt.answers.map(a => ({
        role: 'user',
        content: a.text
      })),
      duration_seconds: Math.round(attempt.answers.reduce((n, a) => n + a.durationSeconds, 0)),
      words_spoken: attempt.answers.reduce((n, a) => n + a.text.split(/\s+/).length, 0),
      total_exchanges: attempt.answers.length,
      report: {
        source: 'unavailable',
        learning: value
      }
    });
    return res.status(200).json(value);
  }
  if (!validAttemptId(id)) throw problem('Invalid practice ID');
  const record = await getOwned('voiceSessions', owner, id);
  const attempt = record?.report?.learning;
  if (!attempt) throw problem('Practice not found', 404);
  if (action === 'get') return res.status(200).json(attempt);
  if (action === 'delete') {
    const children = (await listOwned('voiceSessions', owner)).some(row => row.report?.learning?.parentId === id);
    if (children) throw problem('Delete the linked retries first to preserve their comparison history.', 409);
    for (const recordingId of new Set(attempt.answers.map(a => a.recordingId).filter(Boolean))) {
      await mediaObject(`${owner}/${id}/${recordingId}`, { method: 'DELETE' });
    }
    await deleteOwned('voiceSessions', owner, id);
    return res.status(200).json({ ok: true });
  }

  const recordingId = req.body.recordingId;
  if (!validAttemptId(recordingId) || !attempt.answers.some(a => a.recordingId === recordingId)) throw problem('Recording does not belong to this attempt', 404);
  const key = `${owner}/${id}/${recordingId}`;
  if (action === 'upload') {
    const mime = req.body.mime;
    if (typeof mime !== 'string' || !/^audio\/(webm|ogg|mp4)(;codecs=[\w.,-]+)?$/.test(mime)) throw problem('Unsupported recording format');
    const encoded = req.body.data;
    if (typeof encoded !== 'string' || encoded.length > 4000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw problem('Recording is too large or invalid');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length) throw problem('Recording is empty');
    const detectedMime=audioMime(bytes);
    if(detectedMime!==mime.split(';')[0])throw problem('Recording format does not match its bytes');
    // Raw audio matches the existing private bucket MIME allowlist. Retries compare bytes.
    let old;
    try {
      old = await mediaObject(key);
    } catch (error) {
      if (!['ENOENT'].includes(error.code) && error.status !== 503) throw error;
    }
    if (old) {
      if (digest(old) !== digest(bytes)) throw problem('Saved audio is immutable', 409);
    } else {
      try {
        await mediaObject(key, {
          method: 'POST',
          data: bytes,
          mime: detectedMime
        });
      } catch (error) {
        const saved = await mediaObject(key);
        if (digest(saved) !== digest(bytes)) throw error;
      }
    }
    return res.status(200).json({
      ok: true
    });
  }
  if (action === 'media') {
    const value = await mediaObject(key);
    return res.status(200).json({
      mime: audioMime(value),
      data: value.toString('base64')
    });
  }
  throw problem('Unknown practice action');
}
export default protectedApi(handler);
