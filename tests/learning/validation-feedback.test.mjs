import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpeakingTask, validateAttempt, validateFeedback } from '../../shared/speakingTasks.js';

test('the selected IELTS topic is preserved through the paired drill and partial review', () => {
  const task = getSpeakingTask('paired-sample-ielts-travel-part2');
  assert.deepEqual(task.steps.map(step => step.part), [2, 2, 3, 3, 3]);
  assert.equal(task.steps[0].preparationSeconds, 60);
  const partial = validateAttempt({ track:'exam', taskId: task.id, id:'partial-travel', answers:[{questionIndex:0,text:'I went by train.'}] });
  assert.equal(partial.completed, false);
  assert.equal(partial.answers[0].prompt, task.prompts[0]);
  assert.notDeepEqual(getSpeakingTask('ielts-full-mock-travel-v1').prompts, getSpeakingTask('ielts-full-mock-demo-v1').prompts);
});

test('daily message clarity requires a valid level, learner quote and rationale', () => {
  const attempt = {track:'daily', answers:[{text:'I went by train.'}]};
  const rating = {level:'clear', answerIndex:0, quote:'by train', reason:'The reply specifies the transport.'};
  const feedback = communicationClarity => validateFeedback({summary:'A trip.', improvements:[], communicationClarity}, attempt).communicationClarity;
  assert.deepEqual(feedback(rating), rating);
  assert.equal(feedback({...rating,quote:'by bus'}), null);
  assert.equal(feedback({...rating,level:'9'}), null);
});
