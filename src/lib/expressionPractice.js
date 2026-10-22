export const PRACTICE_DRILLS = [
  { id: 'point', name: 'Land one idea', skill: 'Clarity', time: '30 seconds', duration: 30,
    prompt: 'What is the one thing you want your listener to remember?',
    steps: ['Say your takeaway in the first sentence.', 'Give one reason that matters to this listener.', 'Stop after the reason; replay and try to restate the takeaway.'],
    listenFor: 'Can you name the point after hearing the opening once?',
    transfer: 'Tomorrow, explain a different decision to a colleague. Lead with the takeaway and add one reason.' },
  { id: 'example', name: 'Make it concrete', skill: 'Structure', time: '45 seconds', duration: 45,
    prompt: 'Which idea could your listener understand through a real example?',
    steps: ['State your idea in one sentence.', 'Describe one specific moment: who, what happened, and what changed.', 'Connect the example back to your idea.'],
    listenFor: 'Does the example help you understand why the point matters?',
    transfer: 'In your next conversation, explain an unfamiliar idea with one real moment, then connect it back to your point.' },
  { id: 'emphasis', name: 'Give a key phrase room', skill: 'Emphasis', time: '30 seconds', duration: 30,
    prompt: 'Which short phrase carries the meaning you most want to convey?',
    steps: ['Keep the original meaning and choose one key phrase.', 'Try a brief pause before that phrase, then say it at a comfortable pace.', 'Replay both versions. Keep the pause only if the idea is easier to follow.'],
    listenFor: 'Which phrase stays with you? Does the pause help the meaning or interrupt it?',
    transfer: 'Choose a different key phrase in your next explanation. Try giving it room without copying the exact timing.' },
  { id: 'movement', name: 'Connect movement to meaning', skill: 'Expression', time: '30 seconds', duration: 30,
    prompt: 'What relationship, contrast or feeling are you trying to communicate in these words?',
    steps: ['Replay the original and describe what your movement means to you.', 'Say the same idea again, with your attention on the listener and your meaning.', 'Compare words and movement together. Keep what feels natural and helps the message.'],
    listenFor: 'Does your movement support what you intend to say? Staying still is also a valid choice.',
    transfer: 'Try a different topic next time. Notice whether the same movement still fits your intended meaning.' },
];

export function getDrill(id) { return PRACTICE_DRILLS.find(d => d.id === id) || PRACTICE_DRILLS[0]; }
export function describeTake(clip) {
  const words = String(clip?.text || '').trim().split(/\s+/).filter(Boolean).length;
  const duration = Math.max(0, (clip?.end || 0) - (clip?.start || 0));
  return { words, seconds: Math.round(duration), movements: (clip?.events || []).map(e => e.label).filter(Boolean) };
}

export function makePracticeRecord({ experiment, after, choice, reflection, sameIdea }) {
  if (!sameIdea || !experiment?.intention?.trim() || !after?.text?.trim() || !experiment.before?.text?.trim() ||
    after.sessionId === experiment.before.sessionId || !['first', 'second', 'unsure'].includes(choice) || !reflection?.trim()) return null;
  // Preference is a learner reflection, not an automated improvement/ability score.
  return { id: experiment.id, drillId: experiment.drillId, date: new Date().toISOString(),
    brief: experiment.before.brief || null, intention: experiment.intention.trim().slice(0, 240), choice, reflection: reflection.trim().slice(0, 600),
    before: { text: experiment.before.text.slice(0, 1200), ...describeTake(experiment.before) },
    after: { text: after.text.slice(0, 1200), ...describeTake(after) },
    transfer: getDrill(experiment.drillId).transfer };
}

export function savePracticeRecord(records, record) {
  return [...records.filter(r => r.id !== record.id), record].slice(-60);
}
