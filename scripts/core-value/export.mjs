// Explicit, consent-scoped operator export. Never exports unrelated accounts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const [participantsFile, outputDir] = process.argv.slice(2);
if (!participantsFile || !outputDir) throw new Error('Usage: node scripts/core-value/export.mjs consented-participants.json private-output-dir');
const participants = JSON.parse(await fs.readFile(participantsFile, 'utf8'));
if (!Array.isArray(participants)) throw new Error('Participants must be an explicit consented roster.');
if (new Set(participants.map(p => p.userId)).size !== participants.length || new Set(participants.map(p => p.participantId)).size !== participants.length) throw new Error('Duplicate participant.');
for (const p of participants) if (!/^[A-Za-z0-9_-]{1,64}$/.test(p.participantId) || !p.userId || !Number.isFinite(Date.parse(p.consentRecordedAt)) || !p.consentEvidenceRef || p.audioReviewConsent !== true) throw new Error('Pseudonym, owned user ID, consent evidence/date and explicit audio-review consent are required.');
const { listOwned } = await import('../../api/_appStore.js');
const { mediaObject } = await import('../../api/_mediaStore.js');
const out = path.resolve(outputDir); await fs.mkdir(path.join(out, 'private-recordings'), { recursive: true, mode: 0o700 });
const dataset = { kind: 'real-user', participants: [], practices: [], pairs: [], priorities: [] };
for (const participant of participants) {
  const { userId, audioReviewConsent, ...publicConsent } = participant;
  dataset.participants.push({ ...publicConsent, audioReviewConsent: true });
  const sessions = (await listOwned('presentationSessions', userId)).filter(s => s.report?.impact && Date.parse(s.created_date) >= Date.parse(participant.consentRecordedAt));
  const pairIds = new Map(sessions.map(session => [session.id, randomBytes(10).toString('hex')]));
  const recordings = new Map();
  for (const session of sessions) {
    const m = session.report.impact;
    const feedbackSaved = Boolean(m.metrics?.model && !/fixture|mock|test/i.test(m.metrics.model) && (m.analysis || m.comparison));
    dataset.practices.push({ participantId: participant.participantId, practiceId: pairIds.get(session.id), createdAt: session.created_date, parentPracticeId: pairIds.get(m.parentPracticeId) || null, kind: m.kind || 'original', recordingSaved: Boolean(m.recordings?.length), feedbackSaved, inputSource: m.inputSource });
    if (m.inputSource === 'transcribed' && m.recordings?.length) {
      const recording = m.recordings[0], extension = recording.mime.includes('mp4') ? 'mp4' : recording.mime.includes('ogg') ? 'ogg' : 'webm', name = `${pairIds.get(session.id)}.${extension}`;
      await fs.writeFile(path.join(out, 'private-recordings', name), await mediaObject(`${userId}/${session.id}/${recording.id}`), { mode: 0o600 });
      recordings.set(session.id, `private-recordings/${name}`);
    }
  }
  for (const original of sessions) {
    const m = original.report.impact;
    if (m.parentPracticeId || !recordings.has(original.id) || !m.analysis) continue;
    const view = m.analysis.audiences.find(item => item.audienceType === m.context.targetAudience);
    dataset.priorities.push({ practiceId: pairIds.get(original.id), goal: m.context.desiredOutcome, audience: m.context.audienceDescription || m.context.targetAudience, transcript: m.transcript, recordingRef: recordings.get(original.id), aiPriority: view?.primary || null });
  }
  for (const after of sessions) {
    const m = after.report.impact, before = sessions.find(s => s.id === m.parentPracticeId);
    if (m.kind !== 'moment' || !before || !recordings.has(before.id) || !recordings.has(after.id)) continue;
    const original = before.report.impact;
    if (m.context.coreMessage !== original.context.coreMessage || m.context.desiredOutcome !== original.context.desiredOutcome || m.context.targetAudience !== original.context.targetAudience || m.context.audienceDescription !== original.context.audienceDescription) continue;
    dataset.pairs.push({ pairId: randomBytes(10).toString('hex'), participantId: participant.participantId, goal: original.context.desiredOutcome, audience: original.context.audienceDescription || original.context.targetAudience, coreMessage: original.context.coreMessage,
      before: { practiceId: pairIds.get(before.id), transcript: original.transcript, recordingRef: recordings.get(before.id) }, after: { practiceId: pairIds.get(after.id), transcript: m.transcript, recordingRef: recordings.get(after.id) },
      ai: { priority: m.target ? { category: m.target.category, originalText: m.target.originalText, practiceGoal: m.target.practiceObjective } : null, improvementStatus: m.comparison?.improvementStatus || null } });
  }
}
await fs.writeFile(path.join(out, 'dataset.json'), JSON.stringify(dataset, null, 2), { mode: 0o600 });
console.log(`Exported ${dataset.participants.length} consented participants and ${dataset.pairs.length} recorded pairs. This export is private; redact identifiers in speech/text before sharing with reviewers.`);
