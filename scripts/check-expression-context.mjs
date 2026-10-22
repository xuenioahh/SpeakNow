import assert from 'node:assert/strict';
import { normalizeBrief, baselineScope, matchesBrief } from '../src/lib/expressionContext.js';
import { compareEvidence, learnedPatterns } from '../src/lib/expressionInsights.js';
const brief = { scenarioId: 'office', listener: 'professional', focus: 'clarity', position: 'seated', goal: 'Explain my plan.' };
const example = { id: '0', sessionId: 'current', brief, featureVersion: 2, context: 'Explaining', decision: 'habit', coverage: 1, metrics: { head: 0.1 }, events: [{ key: 'head' }] };
const history = ['a', 'b', 'c'].map(sessionId => ({ ...example, sessionId }));
assert.equal(compareEvidence(example, history).sessions, 3);
assert.equal(compareEvidence(example, history).comparable, 1);
assert.equal(learnedPatterns(history, brief).length, 1);
for (const [key, value] of Object.entries({ scenarioId: 'cafe', listener: 'peer', focus: 'emphasis', position: 'standing' })) {
  const other = { ...brief, [key]: value };
  assert.equal(compareEvidence({ ...example, brief: other }, history).sessions, 0, `Do not mix ${key}`);
  assert.equal(learnedPatterns(history, other).length, 0);
}
assert.equal(compareEvidence(example, history.map(h => ({ ...h, brief: undefined }))).sessions, 0, 'Legacy evidence is retained but not mixed');
assert.equal(compareEvidence(example, history.map(h => ({ ...h, sessionId: 'current' }))).sessions, 0);
assert.equal(compareEvidence(example, history.map(h => ({ ...h, decision: 'rejected' }))).sessions, 0);
assert.equal(normalizeBrief({ ...brief, goal: ' ' }), null);
assert.equal(normalizeBrief({ ...brief, focus: 'personality' }), null);
assert.equal(normalizeBrief({ ...brief, goal: 'a'.repeat(500) }).goal.length, 240);
assert(matchesBrief(brief, { ...brief, goal: 'Another topic with the same task focus.' }), 'Free-text goals are not misrepresented as exact semantic matches');
assert.notEqual(baselineScope(brief), baselineScope(null));
console.log('PASS: baselines isolate scene, audience, focus and camera position; exclude legacy/rejected/current evidence; validate bounded goals.');
