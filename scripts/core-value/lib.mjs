import { createHash, randomInt } from 'node:crypto';
export const DIMENSIONS = ['messageClarity', 'audienceSuitability', 'persuasiveness', 'actionability'];
export const PLANS = { 'task-pass-5': 5, 'monthly-10': 10, 'monthly-15': 15 };
const day = 86400000;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const unique = (items, key) => new Set(items.map(value => value[key])).size === items.length;
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateDataset(dataset) {
  check(['real-user', 'synthetic-fixture'].includes(dataset.kind), 'Declare real-user or synthetic-fixture; never mix them.');
  check(Array.isArray(dataset.participants) && Array.isArray(dataset.pairs) && Array.isArray(dataset.practices), 'Participants, pairs and practices must be explicit arrays.');
  check(unique(dataset.participants, 'participantId') && unique(dataset.pairs, 'pairId') && unique(dataset.practices, 'practiceId'), 'Duplicate identifiers.');
  const participants = new Set();
  for (const participant of dataset.participants) {
    check(/^[a-zA-Z0-9_-]{1,64}$/.test(participant.participantId) && validDate(participant.enrolledAt), 'Use pseudonymous participant IDs and actual enrolment times.');
    check(validDate(participant.consentRecordedAt) && participant.consentEvidenceRef, 'A consent record is required; test data needs a labelled fixture reference.');
    if (dataset.kind === 'real-user') check(participant.audioReviewConsent === true, 'Real audio evaluation requires explicit sharing consent.');
    participants.add(participant.participantId);
  }
  for (const practice of dataset.practices) check(practice.practiceId && participants.has(practice.participantId) && validDate(practice.createdAt) && typeof practice.recordingSaved === 'boolean' && typeof practice.feedbackSaved === 'boolean' && ['transcribed', 'mixed', 'typed'].includes(practice.inputSource), 'Invalid practice evidence.');
  const practices = new Map(dataset.practices.map(practice => [practice.practiceId, practice]));
  for (const pair of dataset.pairs) {
    check(/^[a-zA-Z0-9_-]{1,64}$/.test(pair.pairId) && !['__proto__', 'constructor', 'prototype'].includes(pair.pairId), 'Use safe pseudonymous pair IDs.');
    check(participants.has(pair.participantId) && pair.goal && pair.audience, 'Pair lacks participant, goal or audience.');
    for (const take of [pair.before, pair.after]) {
      const saved = practices.get(take?.practiceId);
      check(saved?.participantId === pair.participantId && saved.recordingSaved && saved.inputSource === 'transcribed' && take.transcript?.trim() && take.recordingRef, 'Primary spoken-effect pairs require actual recordings and transcribed, unedited input from owned practices.');
    }
    check(pair.before.practiceId !== pair.after.practiceId && practices.get(pair.after.practiceId).parentPracticeId === pair.before.practiceId, 'A pair must link two different attempts.');
  }
  if (dataset.priorities !== undefined) {
    check(Array.isArray(dataset.priorities) && unique(dataset.priorities, 'practiceId'), 'Priority candidates must be a unique list.');
    for (const candidate of dataset.priorities) {
      const saved = practices.get(candidate.practiceId);
      check(saved?.recordingSaved && saved.inputSource === 'transcribed' && !saved.parentPracticeId && candidate.goal && candidate.audience && candidate.transcript?.trim() && candidate.recordingRef && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate.practiceId), 'Priority candidates require a recorded original and its goal/audience.');
    }
  }
  return dataset;
}
export function blindPacket(dataset) {
  validateDataset(dataset);
  const mapping = Object.create(null);
  const pairs = dataset.pairs.map(pair => {
    const swapped = Boolean(randomInt(2));
    mapping[pair.pairId] = { A: swapped ? 'after' : 'before', B: swapped ? 'before' : 'after' };
    const first = swapped ? pair.after : pair.before, second = swapped ? pair.before : pair.after;
    return { pairId: pair.pairId, goal: pair.goal, audience: pair.audience, coreMessage: pair.coreMessage || '', A: { transcript: first.transcript, recordingRef: `${pair.pairId}-A${first.recordingRef.match(/\.[A-Za-z0-9]+$/)?.[0] || '.webm'}` }, B: { transcript: second.transcript, recordingRef: `${pair.pairId}-B${second.recordingRef.match(/\.[A-Za-z0-9]+$/)?.[0] || '.webm'}` } };
  });
  return { packet: { kind: dataset.kind, instructions: 'Listen to both anonymous takes. Rate the four dimensions before seeing chronology, the AI priority or the AI comparison. N/A is allowed for persuasion/action when the goal does not require it.', pairs }, mapping };
}
export function validateRatings(ratings, pairIds) {
  const seen = new Set();
  for (const rating of ratings) {
    check(pairIds.has(rating.pairId) && rating.raterId && rating.independenceDeclared === true && rating.hadSeenAiOutput === false, 'Unknown pair or non-independent/unblinded rating.');
    const key = `${rating.pairId}:${rating.raterId}`; check(!seen.has(key), 'Duplicate rater for one pair.'); seen.add(key);
    check(['A', 'B', 'tie', 'insufficient'].includes(rating.preferredTake), 'Invalid human preference.');
    for (const take of ['A', 'B']) for (const dimension of DIMENSIONS) {
      const score = rating[take]?.[dimension];
      check(score === null || Number.isInteger(score) && score >= 1 && score <= 5, 'Human rubric uses 1–5 or explicit N/A (null).');
      if (score === null) check(rating.notApplicableReason?.[dimension], 'N/A requires a reason.');
    }
  }
  return ratings;
}
export function usageMetrics(dataset, offers = [], asOf = new Date().toISOString()) {
  validateDataset(dataset); check(validDate(asOf), 'Invalid observation date.');
  const valid = dataset.practices.filter(p => p.recordingSaved && p.feedbackSaved && p.inputSource === 'transcribed' && Date.parse(p.createdAt) <= Date.parse(asOf));
  const activations = new Map();
  for (const participant of dataset.participants) {
    const first = valid.filter(p => p.participantId === participant.participantId && !p.parentPracticeId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (first) activations.set(participant.participantId, first);
  }
  const activated = [...activations.entries()];
  const valueMoments = activated.filter(([id]) => valid.some(p => p.participantId === id && p.kind === 'moment' && dataset.practices.some(original => original.practiceId === p.parentPracticeId && original.feedbackSaved)));
  const eligible = activated.filter(([, first]) => Date.parse(asOf) >= Date.parse(first.createdAt) + 8 * day);
  const returned = eligible.filter(([id, first]) => valid.some(p => p.participantId === id && Date.parse(p.createdAt) >= Date.parse(first.createdAt) + 7 * day && Date.parse(p.createdAt) < Date.parse(first.createdAt) + 8 * day));
  check(unique(offers, 'offerId'), 'Duplicate offer IDs.');
  for (const offer of offers) {
    check(dataset.participants.some(p => p.participantId === offer.participantId) && Object.hasOwn(PLANS, offer.planId) && validDate(offer.offeredAt) && ['pending', 'purchased', 'declined'].includes(offer.outcome), 'Only actual offered plans and actual decisions belong in the payment ledger.');
    if (offer.outcome !== 'pending') check(validDate(offer.decidedAt), 'Actual decision date required.');
    if (offer.outcome === 'declined') check(offer.reason?.trim(), 'A refusal needs the stated reason.');
    if (offer.outcome === 'purchased') check(offer.amountUsd === PLANS[offer.planId] && offer.transactionId && offer.paymentEvidenceRef && offer.verifiedBy, 'Purchase needs matched price, transaction, payment evidence and independent verification. Intent is not a purchase.');
  }
  offers = offers.filter(o => Date.parse(o.offeredAt) <= Date.parse(asOf) && (o.outcome === 'pending' || Date.parse(o.decidedAt) <= Date.parse(asOf)));
  const purchases = offers.filter(o => o.outcome === 'purchased'); check(unique(purchases, 'transactionId'), 'A transaction cannot be counted twice.');
  const rate = (n, denominator) => denominator ? n / denominator : null;
  return { scope: 'provided-consented-dataset-only, not all product users', source: dataset.kind, enrolled: dataset.participants.length, activated: activated.length, activationRate: rate(activated.length, dataset.participants.length), valueMoments: valueMoments.length, valueMomentRate: rate(valueMoments.length, activated.length), d7Eligible: eligible.length, d7Returned: returned.length, d7Retention: rate(returned.length, eligible.length), definitions: { activation: 'Original spoken practice with saved recording, transcript and feedback.', valueMoment: 'A saved spoken targeted retry following feedback; this is not proven improvement.', d7: 'Another completed spoken practice in [7,8) days after activation; denominator excludes immature cohorts.' }, plans: Object.fromEntries(Object.keys(PLANS).map(planId => {
    const group = offers.filter(o => o.planId === planId);
    return [planId, { offered: group.length, purchased: group.filter(o => o.outcome === 'purchased').length, declined: group.filter(o => o.outcome === 'declined').length, pending: group.filter(o => o.outcome === 'pending').length, purchaseRate: rate(group.filter(o => o.outcome === 'purchased').length, group.length) }];
  })) };
}
export function priorityCandidates(dataset) {
  return dataset.priorities || dataset.pairs.map(pair => ({ practiceId: pair.pairId, transcript: pair.before.transcript, goal: pair.goal, audience: pair.audience, aiPriority: pair.ai?.priority || null, recordingRef: pair.before.recordingRef }));
}
export function validatePriorityReviews(dataset, reviews) {
  const candidates = priorityCandidates(dataset);
  const seen = new Set();
  for (const review of reviews) {
    const id = review.practiceId || review.pairId, candidate = candidates.find(c => c.practiceId === id);
    check(candidate && review.raterId && review.independentBeforeAi === true && review.category && review.reason, 'Priority review requires an independent original-only judgement.');
    const key = `${id}:${review.raterId}`; check(!seen.has(key), 'Duplicate priority reviewer.'); seen.add(key);
    if (review.category !== 'No strong priority') {
      const quote = String(review.originalQuote || '').replace(/\s+/g, ' ').trim();
      check(quote && candidate.transcript.replace(/\s+/g, ' ').includes(quote), 'Human priority must quote the supplied original.');
      for (const value of [review.importance, review.fixability]) check(Number.isInteger(value) && value >= 1 && value <= 5, 'Importance and fixability are human rubric ratings 1–5.');
    }
  }
  return reviews;
}
export function evaluate(dataset, locked, mapping, priorityReviews = []) {
  validateDataset(dataset);
  check(locked.datasetSha256 === digest(dataset) && locked.mappingSha256 === digest(mapping), 'Dataset or blind order changed after locking.');
  check(locked.sha256 === digest(locked.ratings), 'Locked human ratings changed after unblinding.');
  const pairIds = new Set(dataset.pairs.map(pair => pair.pairId)); validateRatings(locked.ratings, pairIds);
  const summaries = dataset.pairs.map(pair => {
    const order = mapping[pair.pairId]; check(order && new Set(Object.values(order)).size === 2 && ['before', 'after'].includes(order.A) && ['before', 'after'].includes(order.B), 'Missing blind mapping.');
    const ratings = locked.ratings.filter(r => r.pairId === pair.pairId);
    const verdicts = ratings.map(r => ['tie', 'insufficient'].includes(r.preferredTake) ? r.preferredTake : order[r.preferredTake]);
    const consensus = ratings.length < 2 ? 'not-enough-raters' : new Set(verdicts).size === 1 ? verdicts[0] : 'disagreement';
    const deltas = Object.fromEntries(DIMENSIONS.map(d => {
      const values = ratings.flatMap(r => { const before = r[order.A === 'before' ? 'A' : 'B'][d], after = r[order.A === 'after' ? 'A' : 'B'][d]; return before === null || after === null ? [] : [after - before]; });
      return [d, { ratings: values.length, meanDelta: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }];
    }));
    return { pairId: pair.pairId, independentRaters: ratings.length, humanPreference: consensus, deltas, aiLabel: pair.ai?.improvementStatus || 'not-available', aiCalledImproved: pair.ai?.improvementStatus === 'Improved' };
  });
  const comparable = summaries.filter(p => ['after', 'before', 'tie'].includes(p.humanPreference) && p.aiLabel !== 'not-available');
  const aiPositive = comparable.filter(p => p.aiCalledImproved);
  if (!Array.isArray(priorityReviews)) {
    check(priorityReviews.datasetSha256 === digest(dataset) && priorityReviews.sha256 === digest(priorityReviews.reviews), 'Independent priority reviews changed after locking.');
    priorityReviews = priorityReviews.reviews;
  } else check(priorityReviews.length === 0, 'Nonempty priority reviews must be locked before AI is revealed.');
  validatePriorityReviews(dataset, priorityReviews);
  const candidates = priorityCandidates(dataset);
  const priorities = priorityReviews;
  const matched = priorities.filter(r => r.category === (candidates.find(c => c.practiceId === (r.practiceId || r.pairId)).aiPriority?.category || 'No strong priority'));
  return { readiness: 'Not Ready', evidenceLevel: dataset.kind === 'synthetic-fixture' ? 'Engineering fixture only; no user value evidence.' : locked.ratings.length === 0 ? 'No independent human judgements supplied; no learning effect has been established.' : 'Human-labelled observations; readiness still requires an audited real core loop and adequate coverage.', realPairs: dataset.kind === 'real-user' ? dataset.pairs.length : 0, summaries, comparison: { comparablePairs: comparable.length, aiImproved: aiPositive.length, humanPreferredAfterAmongAiImproved: aiPositive.filter(p => p.humanPreference === 'after').length, aiImprovedPrecision: aiPositive.length ? aiPositive.filter(p => p.humanPreference === 'after').length / aiPositive.length : null, disagreements: summaries.filter(p => p.humanPreference === 'disagreement').length }, priority: { independentReviews: priorities.length, sameCategory: matched.length, sameCategoryRate: priorities.length ? matched.length / priorities.length : null, meanHumanImportance: priorities.filter(r => Number.isInteger(r.importance)).length ? priorities.filter(r => Number.isInteger(r.importance)).reduce((sum, r) => sum + r.importance, 0) / priorities.filter(r => Number.isInteger(r.importance)).length : null, limitation: 'Category agreement is not agreement on the exact sentence, priority importance or learning effectiveness. Preserve reviewer reasons and adjudicate differences.' } };
}
