import test from 'node:test';
import assert from 'node:assert/strict';
import { retryPairs, supportedChange } from '../../shared/academicCoaching.js';
import { validateFeedback } from '../../shared/speakingTasks.js';

const answer = (questionIndex, text) => ({ questionIndex, text, prompt:'Question ' + questionIndex });
const current = { track:'exam', taskId:'interview', type:'interview', parentId:'first', answers:[answer(2,'I take the train because parking is expensive.')] };
const previous = { id:'first', taskId:'interview', answers:[answer(0,'I drive.'),answer(2,'I take the train.')] };

test('retry feedback compares the same question and checks both exact quotations', () => {
  const pairs = retryPairs(current, previous);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].before, 'I take the train.');
  assert.deepEqual(retryPairs(current, {...previous,taskId:'ielts'}), []);
  assert.deepEqual(retryPairs(current, {...previous,id:'other'}), []);
  assert.deepEqual(retryPairs(current, {...previous,answers:[{...answer(2,'A different answer'),prompt:'Another topic'}]}), []);
  const change = {answerIndex:0,beforeQuote:'I take the train.',afterQuote:'because parking is expensive',observation:'You now give a reason.'};
  assert.deepEqual(supportedChange(change,pairs), change);
  assert.equal(supportedChange({...change,beforeQuote:'I drive.'},pairs), null);
  assert.equal(supportedChange({...change,afterQuote:'It is faster.'},pairs), null);
  assert.equal(supportedChange(change,[{...pairs[0],before:pairs[0].after}]), null);
});

test('open speaking can suggest phrasing while repetition uses its source wording', () => {
  const result={summary:'You explain your transport choice.', improvements:[{answerIndex:0,quote:'I take the train',reason:'Lead with the reason.',suggestion:'Move the reason first.',exercise:'Start with because.',exampleRewrite:'Because parking is expensive, I take the train.'}]};
  assert.equal(validateFeedback(result,current).improvements[0].exampleRewrite,result.improvements[0].exampleRewrite);
  assert.equal(validateFeedback(result,{...current,type:'listen-repeat'}).improvements[0].exampleRewrite,undefined);
});

test('feedback tags use the rubric for the original question in a mixed TOEFL mock', () => {
  const attempt = {...current, exam:'toefl', type:'full-mock', taskSnapshot:{steps:[{type:'listen-repeat'}, {}, {type:'interview'}]}};
  const item = {answerIndex:0,quote:'I take the train',reason:'A relevant reason helps the listener.',suggestion:'Link the reason to the choice.',exercise:'Try again with one reason.'};
  const criterionFor = (value, criterion) => validateFeedback({summary:'You explained your choice.',improvements:[{...item,criterion}]},value).improvements[0].criterion;
  assert.equal(criterionFor(attempt,'development'),'development');
  assert.equal(criterionFor(attempt,'Vocabulary and Grammar'),'language');
  assert.equal(criterionFor(attempt,'wording'),undefined);
  assert.equal(criterionFor(attempt,'delivery'),undefined);
  const firstQuestion = {...attempt, answers:[{...attempt.answers[0],questionIndex:0}]};
  assert.equal(criterionFor(firstQuestion,'wording'),'wording');
  assert.equal(criterionFor(firstQuestion,'development'),undefined);
  assert.equal(criterionFor({...attempt,exam:'ielts'},'grammar'),'grammar');
  assert.equal(criterionFor({...attempt,exam:'ielts'},'pronunciation'),undefined);
  assert.equal(criterionFor({...attempt,track:'daily'},'language'),undefined);
});
