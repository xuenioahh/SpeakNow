import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectLearningMoment } from '../../src/lib/dailyVideoMoment.js';

const video = (start, end, hasAudio = true) => ({ id: `${start}`, start, end, hasAudio, blob: new Blob(['recorded bytes'], { type: 'video/webm' }) });
const answer = [{ startSeconds: 20, durationSeconds: 7, text: 'Could you check this drink?' }];
const evidence = [{ start: 20, end: 28, coverage: .85, text: answer[0].text, observations: { faceX: .12 }, events: [] }];

test('a saved moment must overlap speech and visible evidence and include audio', () => {
  assert.equal(selectLearningMoment([video(20, 28, false)], evidence, answer), null);
  assert.equal(selectLearningMoment([video(2, 10)], evidence, answer), null);
  assert.equal(selectLearningMoment([video(20, 28)], [{ ...evidence[0], coverage: .2 }], answer), null);
  assert.equal(selectLearningMoment([video(20, 31)], evidence, answer), null);
  assert.equal(selectLearningMoment([video(20, 28)], evidence, answer)?.clip.id, '20');
});

test('evidence based framing moment is selected; incidental movement alone is not a fault', () => {
  const selected = selectLearningMoment([video(20, 28), video(30, 38)], [
    { ...evidence[0], observations: { faceX: .5 }, events: [{ key: 'head' }] },
    { ...evidence[0], start: 30, end: 38, text: 'Another reply', observations: { faceX: .1 } },
  ], [...answer, { startSeconds: 30, durationSeconds: 7, text: 'Another reply' }]);
  assert.equal(selected.clip.id, '30');
  assert.equal(selected.offCenter, true);
});
