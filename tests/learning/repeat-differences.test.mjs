import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRepeat } from '../../shared/speakingTasks.js';

test('separate omitted and added words are not paired across matching text', () => {
  const result = compareRepeat('The library opens at nine.', 'Library opens at nine today.');
  assert.deepEqual(result.omissions, ['the']);
  assert.deepEqual(result.additions, ['today']);
  assert.deepEqual(result.substitutions, []);
});

test('replacement pairs stay in their own gaps between matching words', () => {
  const result = compareRepeat('Please take the blue book home.', 'Take the red book home today.');
  assert.deepEqual(result.omissions, ['please']);
  assert.deepEqual(result.additions, ['today']);
  assert.deepEqual(result.substitutions, [{ reference: 'blue', spoken: 'red' }]);
});

test('word-order changes remain tentative and preserve missing and extra evidence', () => {
  const result = compareRepeat('Take the blue book.', 'Take the book blue.');
  assert.equal(result.possibleReordered.length, 1);
  assert.deepEqual(result.possibleReordered, result.missing);
  assert.deepEqual(result.possibleReordered, result.extra);
  assert.deepEqual(result.substitutions, []);
  assert.deepEqual(result.omissions, []);
  assert.deepEqual(result.additions, []);
});

test('repeated words are counted individually rather than removed as a set', () => {
  assert.deepEqual(compareRepeat('The book and the pen.', 'The book and pen.').omissions, ['the']);
  assert.deepEqual(compareRepeat('The book and pen.', 'The book and the pen.').additions, ['the']);
});

test('case and punctuation do not create corrections', () => {
  const result = compareRepeat('It is open.', 'IT IS OPEN!');
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
  assert.equal(result.matched, 3);
});

test('curly source apostrophes and straight recognition apostrophes compare as the same words', () => {
  const result = compareRepeat('Please follow the instructor’s steps. Don’t stop.', "Please follow the instructor's steps. Don't stop.");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
});

test('Unicode source words retain all letters instead of losing accented endings', () => {
  const result = compareRepeat('Visit our café.', 'Visit our café.');
  assert.equal(result.expected, 3);
  assert.equal(result.matched, 3);
  assert.deepEqual(compareRepeat('Visit our café.', 'Visit our cafe.').substitutions, [{ reference: 'café', spoken: 'cafe' }]);
});

test('empty transcript and reference comparisons retain actual missing or added words', () => {
  assert.deepEqual(compareRepeat('It is open.', '').omissions, ['it', 'is', 'open']);
  assert.deepEqual(compareRepeat('', 'It is open.').additions, ['it', 'is', 'open']);
});

test('a whole-hour clock rendering does not distract from an actual article substitution', () => {
  const result = compareRepeat('The library opens at nine.', 'a library opens at 9:00');
  assert.deepEqual(result.substitutions, [{ reference:'the', spoken:'a' }]);
  assert.deepEqual(result.additions, []);
  assert.deepEqual(result.omissions, []);
  assert.equal(compareRepeat('Meet at 09:00.', 'Meet at nine.').missing.length, 0);
  assert.equal(compareRepeat('Meet at nine.', 'Meet at 9:15.').substitutions.length, 1);
  assert.equal(compareRepeat('Meet at nine.', 'Meet at 10:00.').substitutions.length, 1);
});
