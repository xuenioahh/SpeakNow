import { createHash } from 'node:crypto';
import { authenticate, checkOrigin, cookies } from './_auth.js';
import { consumeLimit } from './_securityStore.js';
import { getOwned, saveOwned } from './_appStore.js';
import { validateAttempt } from '../shared/speakingTasks.js';
import { assessSpeechBytes, speechConfiguration } from './_speechAssessment.js';

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '6mb' } } };
export async function handler(req, res) {
  if (req.body?.action === 'status') return res.status(200).json(speechConfiguration());
  let attempt, record;
  try { attempt = validateAttempt(req.body?.attempt); } catch (error) { throw Object.assign(error, { status: 400 }); }
  if (req.user) {
    record = await getOwned('voiceSessions', req.user.id, attempt.id);
    if (!record?.report?.learning) throw Object.assign(new Error('Save this practice before assessing its audio.'), { status: 409 });
    attempt = record.report.learning;
  }
  const { answerIndex, recordingId, data } = req.body;
  const answer = Number.isInteger(answerIndex) && attempt.answers[answerIndex];
  if (!answer?.recordingId || answer.recordingId !== recordingId || answer.inputMode !== 'voice') throw Object.assign(new Error('Choose a recorded answer from this practice.'), { status: 400 });
  if (typeof data !== 'string' || data.length > 5550000 || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw Object.assign(new Error('Audio is too large or invalid.'), { status: 413 });
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data) throw Object.assign(new Error('Invalid audio encoding.'), { status: 400 });
  const previous = attempt.audioAssessments?.[recordingId];
  if (previous?.pronunciation?.status === 'assessed' && previous.audioSha256 === createHash('sha256').update(bytes).digest('hex')) return res.status(200).json(previous);
  const address = req.user?.id || (process.env.VERCEL ? req.headers?.['x-vercel-forwarded-for'] : req.socket?.remoteAddress) || 'unknown';
  const subject = createHash('sha256').update(String(address)).digest('hex');
  if (!await consumeLimit(`speech-minute:${subject}`, 36, 60000) || !await consumeLimit(`speech-day:${subject}`, Number(process.env.SPEAKNOW_SPEECH_DAILY_REQUESTS || 100), 86400000) || !await consumeLimit('speech-global-day', Number(process.env.SPEAKNOW_SPEECH_GLOBAL_REQUESTS || 1000), 86400000)) throw Object.assign(new Error('Speech assessment limit reached. Try again later.'), { status: 429 });
  let result;
  const repeat = attempt.type === 'listen-repeat' || attempt.taskSnapshot?.steps?.[answer.questionIndex]?.type === 'listen-repeat';
  result = await assessSpeechBytes(bytes, { referenceText: repeat ? answer.prompt : '' });
  result.recordingId = recordingId;
  if (record) {
    // Merge the current row after inference so parallel text feedback is preserved.
    const current = await getOwned('voiceSessions', req.user.id, attempt.id);
    if (!current?.report?.learning) throw Object.assign(new Error('Practice no longer exists.'), { status: 404 });
    await saveOwned('voiceSessions', req.user.id, { ...current, report: { ...current.report, learning: { ...current.report.learning,
      audioAssessments: { ...current.report.learning.audioAssessments, [recordingId]: result } } } }, { update: true });
  }
  return res.status(200).json(result);
}
export default async function speakingAudio(req, res) {
  try {
    checkOrigin(req);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST' || !String(req.headers?.['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Use a JSON POST request.'), { status: 405 });
    if (JSON.stringify(req.body || {}).length > 5800000) throw Object.assign(new Error('Audio request is too large.'), { status: 413 });
    if (cookies(req).speaknow_session) await authenticate(req);
    await handler(req, res);
  } catch (error) {
    if (!res.headersSent) res.status(error.status || 503).json({ error: error.status ? error.message : 'Speech assessment is unavailable. Your recording is saved.', code: error.code || 'speech_unavailable' });
  }
}
