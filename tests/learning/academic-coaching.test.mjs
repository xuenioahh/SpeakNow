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
