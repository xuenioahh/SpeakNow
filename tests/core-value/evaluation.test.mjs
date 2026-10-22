import test from 'node:test';
import assert from 'node:assert/strict';
import { blindPacket, digest, evaluate, usageMetrics, validateDataset } from '../../scripts/core-value/lib.mjs';
import { normalizeExamScore } from '../../src/lib/examStandards.js';
import { coachingOnly } from '../../src/lib/feedbackEvidence.js';
import { generateVoiceReport } from '../../src/lib/localReports.js';
const dataset = () => ({ kind: 'synthetic-fixture', participants: [{ participantId: 'p1', enrolledAt: '2026-01-01T00:00:00Z', consentRecordedAt: '2026-01-01T00:00:00Z', consentEvidenceRef: 'TEST-ONLY-CONSENT' }], practices: [
  { participantId: 'p1', practiceId: 'before1', createdAt: '2026-01-01T10:00:00Z', parentPracticeId: null, kind: 'original', recordingSaved: true, feedbackSaved: true, inputSource: 'transcribed' },
  { participantId: 'p1', practiceId: 'after1', createdAt: '2026-01-01T11:00:00Z', parentPracticeId: 'before1', kind: 'moment', recordingSaved: true, feedbackSaved: true, inputSource: 'transcribed' },
], pairs: [{ pairId: 'pair1', participantId: 'p1', goal: 'Explain the proposed evaluation.', audience: 'University classmates.', before: { practiceId: 'before1', transcript: 'Original test expression.', recordingRef: 'before.audio' }, after: { practiceId: 'after1', transcript: 'A different test expression.', recordingRef: 'after.audio' }, ai: { improvementStatus: 'Improved', priority: { category: 'Unsupported Claim' } } }] });
const rubric = score => ({ messageClarity: score, audienceSuitability: score, persuasiveness: score, actionability: score });
function evidence(d, preferences = ['A', 'A']) {
  const mapping = { pair1: { A: 'before', B: 'after' } };
  const ratings = preferences.map((preferredTake, i) => ({ pairId: 'pair1', raterId: `r${i}`, independenceDeclared: true, hadSeenAiOutput: false, preferredTake, A: rubric(4), B: rubric(2) }));
  return { mapping, locked: { datasetSha256: digest(d), mappingSha256: digest(mapping), sha256: digest(ratings), ratings } };
}
test('empty real dataset stays Not Ready and does not invent rates or people', () => {
  const d = { kind: 'real-user', participants: [], practices: [], pairs: [] }, mapping = {};
  const report = evaluate(d, { datasetSha256: digest(d), mappingSha256: digest(mapping), sha256: digest([]), ratings: [] }, mapping);
  assert.equal(report.readiness, 'Not Ready'); assert.equal(report.realPairs, 0); assert.match(report.evidenceLevel, /No independent human/);
  const metrics = usageMetrics(d, [], '2026-02-01T00:00:00Z');
  assert.equal(metrics.activationRate, null); assert.equal(metrics.d7Retention, null);
});
test('blind packets omit AI outputs and chronology', () => {
  const { packet, mapping } = blindPacket(dataset());
  const text = JSON.stringify(packet); assert(!text.includes('Improved')); assert(!text.includes('Unsupported Claim')); assert(!text.includes('before.audio'));
  assert.equal(new Set(Object.values(mapping.pair1)).size, 2);
});
test('human preference can contradict AI and is not overwritten', () => {
  const d = dataset(), { locked, mapping } = evidence(d);
  const report = evaluate(d, locked, mapping);
  assert.equal(report.summaries[0].humanPreference, 'before'); assert.equal(report.comparison.aiImprovedPrecision, 0);
  assert.equal(report.summaries[0].deltas.messageClarity.meanDelta, -2);
  assert.equal(report.realPairs, 0); assert.equal(report.readiness, 'Not Ready');
});
test('independent rater disagreement is not resolved into a fake improvement', () => {
  const d = dataset(), { locked, mapping } = evidence(d, ['A', 'B']);
  const report = evaluate(d, locked, mapping); assert.equal(report.comparison.disagreements, 1); assert.equal(report.comparison.aiImprovedPrecision, null);
});
test('ratings, blind mapping and dataset must remain locked', () => {
  const d = dataset(), { locked, mapping } = evidence(d); locked.ratings[0].preferredTake = 'B';
  assert.throws(() => evaluate(d, locked, mapping), /changed/);
  const stable = evidence(d); assert.throws(() => evaluate(d, stable.locked, { pair1: { A: 'after', B: 'before' } }), /changed/);
});
test('raters exposed to AI cannot enter independent evaluation', () => {
  const d = dataset(), { locked, mapping } = evidence(d); locked.ratings[0].hadSeenAiOutput = true; locked.sha256 = digest(locked.ratings);
  assert.throws(() => evaluate(d, locked, mapping), /independent/);
});
test('typed-only pairs and unconsented participants cannot prove spoken benefit', () => {
  const d = dataset(); d.practices[1].inputSource = 'typed'; assert.throws(() => validateDataset(d), /spoken-effect/);
  const second = dataset(); delete second.participants[0].consentEvidenceRef; assert.throws(() => validateDataset(second), /consent/);
});
test('D7 counts only mature cohorts and actual returns, not the immediate retry', () => {
  const d = dataset(); assert.equal(usageMetrics(d, [], '2026-01-03T00:00:00Z').d7Retention, null);
  assert.equal(usageMetrics(d, [], '2026-01-11T00:00:00Z').d7Retention, 0);
  d.practices.push({ ...d.practices[0], practiceId: 'return1', createdAt: '2026-01-08T12:00:00Z' });
  const metrics = usageMetrics(d, [], '2026-01-11T00:00:00Z'); assert.equal(metrics.d7Retention, 1); assert.equal(metrics.valueMoments, 1);
});
test('purchase intent is not payment; matched receipt evidence and unique transactions are required', () => {
  const d = dataset(), offer = { offerId: 'o1', participantId: 'p1', planId: 'task-pass-5', offeredAt: '2026-01-02T00:00:00Z', decidedAt: '2026-01-02T01:00:00Z', outcome: 'purchased' };
  assert.throws(() => usageMetrics(d, [offer]), /payment evidence/);
  Object.assign(offer, { amountUsd: 5, transactionId: 'TEST-TRANSACTION', paymentEvidenceRef: 'TEST-RECEIPT', verifiedBy: 'test-operator' });
  assert.equal(usageMetrics(d, [offer]).plans['task-pass-5'].purchased, 1);
  assert.throws(() => usageMetrics(d, [offer, { ...offer, offerId: 'o2' }]), /twice/);
});
test('unsupported score and acoustic claims are removed from new reports', () => {
  const report = generateVoiceReport({ messages: [{ role: 'user', content: 'I propose a small evaluation because the result is not established.' }], scoring: 'ielts', duration: 30, words: 14, exchanges: 1, scenarioTitle: 'University discussion', mode: 'beginner', dialogMode: 'goal_oriented' });
  assert.deepEqual(report.scores, {}); assert.equal(report.totalScore, null); assert.equal(report.pronunciation_analysis, null); assert.equal(report.fluency_analysis, null);
  const filtered = coachingOnly({ source: 'ai', scores: { pronunciation: 9 }, overallScore: 90, priorityCards: [{ score: 88 }], feedback: { body_language: 'Perfect posture', content: 'Review the stated evidence.' } });
  assert.deepEqual(filtered.scores, {}); assert.equal(filtered.priorityCards[0].score, null); assert.equal(filtered.feedback.body_language, undefined); assert.equal(filtered.evidence_kind, 'ai-coaching-suggestion');
});

test('independent priority calibration includes model abstention and rejects ungrounded human quotes', () => {
  const d = dataset(); d.priorities = [{ practiceId: 'before1', goal: 'Explain the proposal.', audience: 'Classmates.', transcript: d.pairs[0].before.transcript, recordingRef: 'before.audio', aiPriority: null }];
  const reviews = [{ practiceId: 'before1', raterId: 'coach1', independentBeforeAi: true, category: 'No strong priority', reason: 'No strong change is warranted in this synthetic test.' }];
  const lockedPriority = { datasetSha256: digest(d), sha256: digest(reviews), reviews };
  const { locked, mapping } = evidence(d);
  const report = evaluate(d, locked, mapping, lockedPriority); assert.equal(report.priority.sameCategoryRate, 1);
  assert.throws(() => evaluate(d, locked, mapping, reviews), /must be locked/);
  const invalid = [{ ...reviews[0], category: 'Unsupported Claim', originalQuote: 'Invented quote', importance: 5, fixability: 4 }];
  assert.throws(() => evaluate(d, locked, mapping, { datasetSha256: digest(d), sha256: digest(invalid), reviews: invalid }), /quote/);
});

test('missing scores stay absent rather than turning into zero', () => {
  for (const missing of [null, undefined, '', '  ', false, {}]) assert.equal(normalizeExamScore(missing, 'ielts'), null);
  assert.equal(normalizeExamScore(6.5, 'ielts'), 6.5);
});
