import assert from 'node:assert/strict';
import { hasReportedScore, displayScore, completeScoreVector, displayRecordDate, displayDuration } from '../src/lib/reportDisplay.js';
import { coachingOnly } from '../src/lib/feedbackEvidence.js';
for (const value of [null, undefined, '', ' ', false, true, NaN, Infinity, {}, []]) {
  assert.equal(hasReportedScore(value), false); assert.equal(displayScore(value), '—');
}
for (const value of [0, 1, 4.5, 6, 9, 10, '7.0']) assert.equal(displayScore(value), String(value));
const scores = Object.freeze({ Fluency: 0, Grammar: 5.5, Vocabulary: 9 });
assert.equal(completeScoreVector(scores), true);
assert.equal(completeScoreVector({ Fluency: null, Grammar: 5.5 }), false);
assert.equal(completeScoreVector({}), false);
assert.equal(displayDuration(null), '—'); assert.equal(displayDuration(0), '0m 0s'); assert.equal(displayDuration(95), '1m 35s');
assert.equal(displayRecordDate(null), 'Date unavailable'); assert.equal(displayRecordDate('bad date'), 'Date unavailable');
assert.match(displayRecordDate('2026-10-08T12:00:00Z'), /2026/);
assert.deepEqual(scores, { Fluency: 0, Grammar: 5.5, Vocabulary: 9 });
// Current requirements intentionally removed unsupported legacy scores. Assert
// their evidence boundary rather than freezing pre-repair source files in /tmp.
const legacy = Object.freeze({ source: 'ai', scores, overall_score: 8, pronunciation_analysis: 'unsupported', feedback: { pronunciation: 'unsupported', structure: 'Keep the conclusion clear.' } });
const guidance = coachingOnly(legacy);
assert.equal(guidance.score_available, false);
assert.deepEqual(guidance.scores, {});
assert.equal(guidance.overall_score, null);
assert.equal(guidance.pronunciation_analysis, null);
assert.deepEqual(guidance.feedback, { structure: 'Keep the conclusion clear.' });
assert.equal(guidance.evidence_kind, 'ai-coaching-suggestion');
assert.equal(legacy.overall_score, 8);
assert.equal(legacy.scores, scores);
console.log('PASS: missing values, real zero/fractions, dates/durations, immutable source data and current coaching evidence boundary');
