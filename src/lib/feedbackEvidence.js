// Model/rule output is coaching, never an acoustic measurement or proof of learning.
export function coachingOnly(value = {}) {
  /** @type {Record<string, any>} */
  const next = { ...value, evidence_kind: value.source === 'ai' ? 'ai-coaching-suggestion' : 'local-practice-guidance', measurement_basis: 'supplied-text-and-session-metadata', score_available: false, scores: {}, overall_score: null, overallScore: null, totalScore: null, pronunciation_analysis: null, fluency_analysis: null };
  if (Array.isArray(value.priorityCards)) next.priorityCards = value.priorityCards.map(card => ({ ...card, score: null }));
  if (value.feedback) next.feedback = Object.fromEntries(Object.entries(value.feedback).filter(([key]) => !['body_language', 'pronunciation', 'eye_contact', 'posture'].includes(key)));
  return next;
}
