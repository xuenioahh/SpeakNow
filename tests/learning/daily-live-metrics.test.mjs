import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyLiveMetrics } from '../../src/lib/dailyLiveMetrics.js';

test('audio measurements change with actual RMS, silence and confirmed words', () => {
  const live = new DailyLiveMetrics();
  for (const [time, rms] of [[0,.05],[.2,.05],[.4,.05],[.6,0],[.8,0],[1,0],[1.2,0],[1.4,.08],[1.6,.08],[1.8,.08],[2,.08]]) live.audioSample(time, rms, true, 'Could you help me check this drink?');
  const snapshot = live.snapshot();
  assert.equal(snapshot.pauses.value, '1 pauses');
  assert.match(snapshot.volume.value, /dBFS/);
  assert.match(snapshot.pace.value, /wpm/);
  live.turn('Could you help me check this drink?', 2);
  assert.equal(live.summary().timeline.find(item => item.kind === 'turn').words, 7);
  assert.equal(live.snapshot().pronunciation, undefined);
  assert.equal(live.snapshot().intonation, undefined);
});

test('camera metrics follow landmark changes and stop when camera closes', () => {
  const live = new DailyLiveMetrics();
  live.videoSample({ time: 1, head: 0, faceX: .5, faceY: .5, posture: .03, leftHand: .3, rightHand: .4 });
  assert.equal(live.snapshot().headOrientation.value, 'Near camera direction');
  live.videoSample({ time: 1.5, head: .35, faceX: .88, faceY: .5, posture: .15, leftHand: .65, rightHand: .4 });
  assert.equal(live.snapshot().headOrientation.value, 'Turned right');
  assert.equal(live.snapshot().framing.value, 'Face near frame edge');
  assert.equal(live.snapshot().handMovement.value, '1 movement events');
  live.cameraOff();
  assert.equal(live.snapshot().headOrientation, undefined);
  assert.equal(live.snapshot().handMovement, undefined);
  assert.equal(live.summary().timeline.filter(item => item.kind === 'video').length, 2);
});

test('language feedback updates only with actual returned content', () => {
  const live = new DailyLiveMetrics();
  live.feedback({ task: '', grammar: '', vocabulary: '' }, 2);
  assert.equal(live.snapshot().relevance, undefined);
  live.feedback({ task: 'The request answers the barista.', grammar: 'Verb form needs a change.' }, 3);
  assert.equal(live.snapshot().relevance.value, 'The request answers the barista.');
  assert.equal(live.snapshot().grammar.reliability, 'AI feedback');
  assert.equal(live.snapshot().coherence, undefined);
});
