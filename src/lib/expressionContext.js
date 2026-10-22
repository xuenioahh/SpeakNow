// Product grouping choices, not validated psychological categories.
export const EXPRESSION_SCENARIOS = ['personal', 'airport', 'bank', 'hotel', 'restaurant', 'shopping', 'hospital', 'university', 'office', 'phone', 'car_rental', 'museum', 'cafe'];
export const EXPRESSION_FOCUS = [
  { id: 'clarity', label: 'Make my point clear', question: 'Can your listener name your main point after hearing this once?' },
  { id: 'structure', label: 'Make my explanation easier to follow', question: 'Does this moment connect your point to a reason or concrete example?' },
  { id: 'emphasis', label: 'Give key words emphasis', question: 'Which words stand out when you replay this, and are they the ones you intended?' },
  { id: 'movement', label: 'Explore movement and meaning', question: 'How does this movement fit the meaning you wanted your listener to take away?' },
];
export const EXPRESSION_LISTENERS = [
  { id: 'peer', label: 'Friend or peer' }, { id: 'professional', label: 'Manager, adviser or professional' },
  { id: 'service', label: 'Someone helping with a service' }, { id: 'group', label: 'A group or audience' },
];
export function normalizeBrief(input) {
  if (!input || !EXPRESSION_SCENARIOS.includes(input.scenarioId) || !EXPRESSION_FOCUS.some(f => f.id === input.focus) ||
      !EXPRESSION_LISTENERS.some(l => l.id === input.listener) || !['seated', 'standing'].includes(input.position) ||
      typeof input.goal !== 'string' || !input.goal.trim()) return null;
  return { scenarioId: input.scenarioId, listener: input.listener, focus: input.focus,
    position: input.position, goal: input.goal.trim().slice(0, 240) };
}
export function baselineScope(input) {
  const brief = normalizeBrief(input);
  return brief ? [brief.scenarioId, brief.listener, brief.focus, brief.position].join('|') : 'legacy';
}
export function matchesBrief(a, b) { return baselineScope(a) === baselineScope(b); }
export function focusQuestion(brief) {
  return EXPRESSION_FOCUS.find(f => f.id === brief?.focus)?.question || 'What did you want your listener to understand in this moment?';
}
