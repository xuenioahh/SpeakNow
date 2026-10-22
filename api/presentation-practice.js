import { protectedApi } from './_apiGuard.js';
import { getOwned, saveOwned, listOwned } from './_appStore.js';
import { validateContext, hasQuote } from '../src/impact/contracts.js';

export async function practiceHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {}, owner = req.user.id;
  if (body.action === 'get') {
    const value = await getOwned('presentationSessions', owner, body.id);
    if (!value) return res.status(404).json({ error: 'Practice not found' });
    return res.status(200).json({ session: value });
  }
  if (body.action === 'linked') {
    const parent = await getOwned('presentationSessions', owner, body.id);
    if (!parent) return res.status(404).json({ error: 'Practice not found' });
    return res.status(200).json({ sessions: (await listOwned('presentationSessions', owner)).filter(session => session.report?.impact?.parentPracticeId === body.id) });
  }
  if (body.action !== 'save') return res.status(400).json({ error: 'Unknown practice action' });
  if (!/^[a-f0-9-]{36}$/i.test(body.id || '') || typeof body.transcript !== 'string' || !body.transcript.trim() || body.transcript.length > 30000 || !['typed', 'transcribed', 'mixed'].includes(body.inputSource)) return res.status(400).json({ error: 'A valid practice ID, transcript and input source are required.' });
  const context = validateContext(body.context);
  if (!context.topic.trim() || !context.coreMessage.trim() || !context.desiredOutcome.trim()) return res.status(400).json({ error: 'Topic, core message and desired outcome are required.' });
  let target = null;
  if (body.parentPracticeId) {
    const parent = await getOwned('presentationSessions', owner, body.parentPracticeId);
    if (!parent?.report?.impact) return res.status(404).json({ error: 'Original practice not found' });
    if (body.kind === 'moment') {
      const view = parent.report.impact.analysis?.audiences?.find(item => item.audienceType === context.targetAudience);
      target = [view?.primary, ...(view?.secondary || [])].filter(Boolean).find(item => item.id === body.targetId);
      if (!target || !hasQuote(parent.report.impact.transcript, target.originalText)) return res.status(400).json({ error: 'The target must come from the owned original report.' });
      if (context.coreMessage !== parent.report.impact.context.coreMessage || context.desiredOutcome !== parent.report.impact.context.desiredOutcome || context.targetAudience !== parent.report.impact.context.targetAudience || context.audienceDescription !== parent.report.impact.context.audienceDescription) return res.status(400).json({ error: 'The retry must preserve the original message, outcome and audience for a comparable attempt.' });
    } else if (body.kind !== 'audience') return res.status(400).json({ error: 'Invalid linked practice kind' });
  } else if (body.kind) return res.status(400).json({ error: 'A linked practice requires its original record.' });
  const existing = await getOwned('presentationSessions', owner, body.id);
  if (existing) {
    if (existing.report?.impact?.transcript !== body.transcript || JSON.stringify(existing.report?.impact?.context) !== JSON.stringify(context)) return res.status(409).json({ error: 'The original practice is immutable. Save a separate attempt.' });
    return res.status(200).json({ session: existing });
  }
  const duration = Math.max(0, Math.min(7200, Math.floor(Number(body.duration) || 0)));
  const impact = { version: 2, context, transcript: body.transcript, inputSource: body.inputSource, recordingIds: [], recordings: [], ...(body.parentPracticeId ? { parentPracticeId: body.parentPracticeId, kind: body.kind, target } : {}) };
  const session = await saveOwned('presentationSessions', owner, { id: body.id, created_date: new Date().toISOString(), file_name: String(body.fileName || context.topic).slice(0, 200), duration_seconds: duration, total_pages: Math.min(500, Math.max(0, Number(body.totalPages) || 0)), page_timings: Array.isArray(body.pageTimings) ? body.pageTimings.filter(Number.isFinite).slice(0, 500) : [], report: { source: 'transcript', measurement_basis: 'transcript-and-recording-metadata', impact } });
  return res.status(200).json({ session });
}
export default protectedApi(practiceHandler);
