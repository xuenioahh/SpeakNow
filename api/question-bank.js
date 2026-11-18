import { authenticate, cookies, checkOrigin } from './_auth.js';
import { ALL_QUESTION_SETS } from '../shared/questionBank.js';
import { getSpeakingTask } from '../shared/speakingTasks.js';
import { membershipSubject } from './_membership.js';
import { catalogueFor } from './_bankAccess.js';
import { readLedger, readMembership } from './_membershipStore.js';
export default async function questionBank(req, res) {
  try {
    checkOrigin(req);
    if (cookies(req).speaknow_session) await authenticate(req);
    if (req.method !== 'POST' || req.body?.action !== 'catalogue') return res.status(400).json({ error: 'Request a catalogue.' });
    res.setHeader('Cache-Control', 'private, no-store');
    const catalogue = catalogueFor(req, req.user ? await readMembership(req.user.id) : null);
    const enrolled = (await readLedger(membershipSubject(req))).sessions;
    const ids = new Set();
    for (const session of Object.values(enrolled)) if (session.kind !== 'daily' && session.status === 'reserved' && session.expiresAt > Date.now()) {
      const task = getSpeakingTask(session.taskId);
      if (task?.setId) ids.add(task.setId);
      for (const step of task?.steps || []) if (step.sourceSetId) ids.add(step.sourceSetId);
    }
    const merged = new Map(catalogue.sets.map(set => [set.setId, set]));
    for (const set of ALL_QUESTION_SETS) if (ids.has(set.setId)) merged.set(set.setId, set);
    return res.status(200).json({ ...catalogue, sets: [...merged.values()] });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Question bank unavailable. Retry.', code: error.code || 'bank_unavailable' }); }
}
