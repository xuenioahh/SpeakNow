import { matchesBrief } from './expressionContext.js';
export const FEATURE_VERSION = 2;
export const EXPRESSION_CONTEXTS = ['Agreement', 'Disagreement', 'Explaining', 'Thinking aloud', 'Other'];
export const EXPRESSION_METRICS = {
  head: 'Horizontal head movement', headVertical: 'Vertical head movement', eyes: 'Eye position',
  posture: 'Shoulder movement', hands: 'Hand movement', leftHand: 'Left wrist height', rightHand: 'Right wrist height',
};
const noiseFloor = { head: 0.04, headVertical: 0.04, eyes: 0.04, posture: 0.04, hands: 0.08, leftHand: 0.08, rightHand: 0.08 };
const median = values => { const sorted = [...values].sort((a, b) => a - b); const n = sorted.length; return n ? (sorted[Math.floor(n / 2)] + sorted[Math.floor((n - 1) / 2)]) / 2 : 0; };

// Geometric trajectories, not gesture meanings. Gaps reset direction.
export function describeMotion(samples, key) {
  let anchor = null, lastTime = null, direction = 0, reversals = 0;
  const valid = samples.filter(s => Number.isFinite(s[key]));
  for (const point of valid) {
    if (anchor === null || point.time - lastTime > 0.8) { anchor = point[key]; direction = 0; }
    const delta = point[key] - anchor;
    if (Math.abs(delta) >= noiseFloor[key]) {
      const nextDirection = Math.sign(delta);
      if (direction && direction !== nextDirection) reversals++;
      direction = nextDirection; anchor = point[key];
    }
    lastTime = point.time;
  }
  const values = valid.map(p => p[key]);
  return { reversals, range: values.length ? Math.max(...values) - Math.min(...values) : 0,
    coverage: valid.length / Math.max(1, samples.length) };
}

export function summarizeWindow(samples) {
  const result = {};
  for (const key of Object.keys(EXPRESSION_METRICS)) {
    const values = samples.map(s => s[key]).filter(Number.isFinite);
    // Missing / occluded landmarks are never treated as stillness.
    if (values.length < 8 || values.length / Math.max(1, samples.length) < 0.6) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    result[key] = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  }
  return result;
}

export function createReviewClips(samples, utterances, duration) {
  const ends = utterances.map(u => u.end).filter(t => Number.isFinite(t) && t > 0 && t <= duration).sort((a, b) => a - b);
  const clips = [];
  for (let start = 0; start < duration;) {
    const speechEnd = ends.find(t => t - start >= 3 && t - start <= 12);
    let end = Math.min(speechEnd ?? start + 8, duration);
    if (duration - end < 2) end = duration;
    if (end <= start) break;
    const frames = samples.filter(s => s.time >= start && s.time < end);
    const metrics = summarizeWindow(frames);
    const motion = Object.fromEntries(Object.keys(metrics).map(k => [k, describeMotion(frames, k)]));
    const events = Object.entries(motion).filter(([, m]) => m.reversals >= 2).map(([key, m]) => ({ key, reversals: m.reversals,
      label: `Repeated ${EXPRESSION_METRICS[key].toLowerCase()}`, confidence: 'tentative' }));
    const text = utterances.filter(u => u.end > start && u.start < end).map(u => u.text).join(' ');
    const trajectory = frames.filter((_, i) => i % Math.max(1, Math.ceil(frames.length / 24)) === 0).map(s =>
      Object.fromEntries([['time', Number(s.time.toFixed(2))], ...Object.keys(metrics).filter(k => Number.isFinite(s[k])).map(k => [k, Number(s[k].toFixed(4))])]));
    const coverage = Math.min(1, frames.length / Math.max(1, (end - start) * 4));
    clips.push({ id: String(start), start, end, text, metrics, motion, events, trajectory, coverage,
      featureVersion: FEATURE_VERSION, context: '', decision: '', note: '', personalNote: '',
      reason: coverage < 0.5 || !Object.keys(metrics).length ? 'Limited visual evidence. Review manually before drawing a conclusion.'
        : events.length ? 'Repeated movement overlaps this part of your speech. Check whether it feels familiar.'
          : 'A speaking moment to compare with your previous examples.' });
    start = end;
  }
  return clips;
}

export function compareEvidence(clip, history) {
  const matches = history.filter(h => matchesBrief(h.brief, clip.brief) && h.context === clip.context && h.decision === 'habit' && h.sessionId !== clip.sessionId &&
    (h.featureVersion || 1) === (clip.featureVersion || 1) && (h.featureVersion !== FEATURE_VERSION || h.coverage >= 0.5));
  const sessions = new Set(matches.map(h => h.sessionId)).size;
  const differences = [];
  let comparable = 0;
  if (sessions >= 3) for (const key of Object.keys(clip.metrics)) {
    const groups = new Map();
    for (const h of matches) if (Number.isFinite(h.metrics?.[key])) groups.set(h.sessionId, [...(groups.get(h.sessionId) || []), h.metrics[key]]);
    const values = [...groups.values()].map(median);
    if (values.length < 3) continue;
    comparable++;
    const center = median(values);
    const tolerance = Math.max(noiseFloor[key] || 0.04, 3 * 1.4826 * median(values.map(v => Math.abs(v - center))));
    let different = Math.abs(clip.metrics[key] - center) > tolerance;
    const rate = h => Number.isFinite(h.motion?.[key]?.reversals) && h.end > h.start ? h.motion[key].reversals / (h.end - h.start) : null;
    const rates = new Map();
    for (const h of matches) if (rate(h) !== null) rates.set(h.sessionId, [...(rates.get(h.sessionId) || []), rate(h)]);
    if (rates.size >= 3 && rate(clip) !== null) {
      const perSession = [...rates.values()].map(median);
      const typical = median(perSession);
      different ||= Math.abs(rate(clip) - typical) > Math.max(0.25, 3 * 1.4826 * median(perSession.map(v => Math.abs(v - typical))));
    }
    if (different) differences.push(key);
  }
  return { sessions, comparable, differences };
}

export function compareWithHistory(clip, history) {
  if (!clip.context) return 'Confirm what you meant here to compare similar conversations.';
  const result = compareEvidence(clip, history);
  if (result.sessions < 3) return `${result.sessions}/3 separate sessions with confirmed examples in this context${clip.brief ? ", scene, audience, focus and camera setup" : ""}. Still learning your pattern.`;
  if (!result.comparable) return 'More visible movement samples are needed for a comparison.';
  return result.differences.length
    ? `${result.differences.map(k => EXPRESSION_METRICS[k]).join(', ')} differs from your confirmed examples. Worth a look; this is not a mistake.`
    : 'Within the range of your confirmed examples in this context. This may be part of your expression style.';
}

export function saveExample(history, example) {
  const { trajectory: _trajectory, ...saved } = example;
  return [...history.filter(h => !(h.sessionId === example.sessionId && h.id === example.id)), saved].slice(-240);
}

export function rankReviewClips(clips, history) {
  return clips.map(clip => {
    const eligible = clip.coverage >= 0.5 && Object.keys(clip.metrics).length > 0;
    const differences = eligible && clip.context ? compareEvidence(clip, history).differences : [];
    const priority = eligible ? differences.length * 3 + (clip.events?.length ? 2 : 0) + (clip.text.trim() ? 1 : 0) : 0;
    return { ...clip, priority, reviewLabel: differences.length ? 'Different from your usual range' : eligible && clip.events?.length ? 'Movement to revisit' : 'Other moment' };
  }).sort((a, b) => b.priority - a.priority || a.start - b.start);
}

export function learnedPatterns(history, brief = null) {
  return EXPRESSION_CONTEXTS.flatMap(context => {
    const examples = history.filter(h => matchesBrief(h.brief, brief) && h.context === context && h.decision === 'habit' && h.featureVersion === FEATURE_VERSION && h.coverage >= 0.5);
    return ['head', 'headVertical', 'eyes', 'posture', 'hands'].flatMap(key => {
      const observed = new Set(examples.filter(h => Number.isFinite(h.metrics?.[key])).map(h => h.sessionId));
      const repeated = new Set(examples.filter(h => h.events?.some(e => e.key === key)).map(h => h.sessionId));
      if (repeated.size < 3) return [];
      return [{ context, key, count: repeated.size, total: observed.size,
        label: `Repeated ${EXPRESSION_METRICS[key].toLowerCase()} in ${repeated.size} of ${observed.size} confirmed sessions labelled “${context}”.` }];
    });
  });
}
