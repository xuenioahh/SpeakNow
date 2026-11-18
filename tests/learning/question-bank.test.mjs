import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { QUESTION_SETS, getBankTask, getBankQuestion, bankSelection, examPath, setProgress } from '../../shared/questionBank.js';
import { getSpeakingTask, validateAttempt } from '../../shared/speakingTasks.js';

const painting = QUESTION_SETS.find(set => set.setTitle === 'Painting Class');
const campus = QUESTION_SETS.find(set => set.setTitle === 'Campus Tour Guide');
const health = QUESTION_SETS.find(set => set.setTitle === 'Health and Diet');
const attempt = (set, indices, extra = {}) => ({ id: 'question-bank-test-attempt', track: 'exam', taskId: set.setId,
  answers: indices.map(questionIndex => ({ questionIndex, questionId: set.questions[questionIndex].questionId,
    text: 'An actual answer.', rawTranscript: 'Original recognised words.', inputMode: 'voice', recordingId: `recording-question-${questionIndex}` })), ...extra });

test('import contains every verified source group and 628 unique question IDs', () => {
  const repeat = QUESTION_SETS.filter(set => set.taskType === 'repeat'), interview = QUESTION_SETS.filter(set => set.taskType === 'interview');
  assert.equal(repeat.length, 49); assert.equal(repeat.flatMap(set => set.questions).length, 340);
  assert.equal(interview.length, 77); assert.equal(interview.flatMap(set => set.questions).length, 288);
  assert.equal(new Set(QUESTION_SETS.map(set => set.setId)).size, 126);
  assert.equal(new Set(QUESTION_SETS.flatMap(set => set.questions.map(question => question.questionId))).size, 628);
  assert.ok(interview.every(set => set.questions.every(question => question.referenceAnswer && !/答题框架|语料依据|<details>/.test(question.referenceAnswer))));
  assert.ok(QUESTION_SETS.every(set => set.questions.every(question => question.audioSource === null && !question.availability.sourceAudio && question.rawText && question.sourceRefs.length)));
});

test('real Painting, Campus and Interview contents and references are distinct and correctly aligned', () => {
  assert.equal(painting.questions[0].questionText, 'Welcome to the painting class.');
  assert.equal(campus.questions[0].questionText, 'Welcome to our campus tour.');
  assert.equal(health.questions[0].questionText, 'How do you maintain your physical health?');
  assert.match(health.questions[1].referenceAnswer, /nutritional habits/);
  assert.notEqual(health.questions[0].referenceAnswer, health.questions[1].referenceAnswer);
  assert.deepEqual(getSpeakingTask(campus.setId).prompts, campus.questions.map(question => question.questionText));
});

test('source irregularities are retained instead of filling or splitting groups', () => {
  assert.equal(QUESTION_SETS.find(set => set.setTitle === 'Recycling Procedures').questions.length, 6);
  assert.equal(QUESTION_SETS.find(set => set.setTitle === 'Dining Out' && set.sourceDate === '4.15').questions.length, 1);
  assert.equal(QUESTION_SETS.find(set => set.setTitle === 'Public Parks, Recreation, and Online Shopping').questions.length, 8);
  assert.equal(QUESTION_SETS.find(set => set.setTitle === 'Amusement Park').sourceDate, '2025-03-02');
  const report = JSON.parse(fs.readFileSync(new URL('../../shared/question-bank/import-report.json', import.meta.url)));
  assert.equal(report.duplicateFilesSkipped, 1); assert.equal(report.duplicateSetsRemoved, 46);
  assert.equal(report.duplicateQuestionsRemoved, 319); assert.equal(report.extractionConflictsResolved.length, 3);
  assert.deepEqual(report.missingFiles, ['repeat真题参考(1).pdf']);
});

test('set and non-first single-question routes preserve selection, retry and resume', () => {
  const task = getBankTask(campus.setId), path = examPath(task, { questionIndex: 4, parentId: 'original-attempt', focus: 'Repeat exactly', session: 'resume-attempt', stage: 'practice' });
  const url = new URL(path, 'http://test');
  assert.equal(url.pathname, '/exam/practice'); assert.equal(url.searchParams.get('scope'), 'question');
  assert.equal(url.searchParams.get('questionId'), campus.questions[4].questionId);
  assert.equal(url.searchParams.get('retry'), 'original-attempt'); assert.equal(url.searchParams.get('session'), 'resume-attempt');
  assert.equal(bankSelection(url.searchParams).questionIndex, 4);
  assert.equal(bankSelection(new URL(examPath(task), 'http://test').searchParams).questionIndex, null);
});

test('invalid and cross-set question selections never fall back to question zero', () => {
  for (const values of [
    { setId: 'does-not-exist' }, { setId: painting.setId, questionId: campus.questions[1].questionId },
    { setId: painting.setId, taskType: 'interview' }, { setId: painting.setId, scope: 'question' },
    { setId: painting.setId, questionId: painting.questions[1].questionId, scope: 'set' }
  ]) assert.equal(bankSelection(new URLSearchParams(values)), null);
  assert.equal(getBankQuestion('does-not-exist'), null);
});

test('attempt validation binds immutable bank question IDs, original and confirmed transcripts', () => {
  const value = validateAttempt(attempt(health, [2], { practiceMode: 'quick' }));
  assert.equal(value.setId, health.setId); assert.equal(value.questionId, health.questions[2].questionId);
  assert.equal(value.answers[0].prompt, health.questions[2].questionText);
  assert.equal(value.answers[0].rawTranscript, 'Original recognised words.');
  assert.equal(value.completed, true); assert.equal(value.scope, 'question');
  assert.equal(value.taskSnapshot.questions[2].referenceAnswer, health.questions[2].referenceAnswer);
  assert.throws(() => validateAttempt({ ...attempt(health, [0]), answers: [{ ...attempt(health, [0]).answers[0], questionId: campus.questions[0].questionId }] }), /different question/);
  assert.throws(() => validateAttempt(attempt(health, [0, 0])), /twice/);
  assert.throws(() => validateAttempt(attempt(health, [0, 1], { practiceMode: 'quick' })), /exactly one/);
});

test('progress counts submitted answers, deduplicates retries and excludes an unfinished take', () => {
  const first = attempt(painting, [0]), retry = attempt(painting, [0]);
  let progress = setProgress(painting, [first, retry], [{ taskId: painting.setId, answers: [], recordingId: 'unsubmitted-take' }]);
  assert.equal(progress.answered, 1); assert.equal(progress.status, 'In progress');
  progress = setProgress(painting, [first], [{ taskId: painting.setId, answers: attempt(painting, [1, 2]).answers }]);
  assert.equal(progress.answered, 3); assert.equal(progress.status, 'In progress');
  assert.equal(setProgress(painting, [attempt(painting, [0, 1, 2, 3, 4, 5, 6])], []).status, 'Completed');
  assert.equal(setProgress(campus, [first], []).status, 'Not started');
});

test('legacy sample task IDs remain readable for previous attempts', () => {
  assert.equal(getSpeakingTask('toefl-repeat-campus-v1').prompts[0], 'The library opens at nine.');
  assert.equal(getSpeakingTask('ielts-part2-skill-v1').prompts.length, 2);
});

test('started but unanswered practice is resumable without marking a question complete', () => {
  const progress = setProgress(painting, [], [{ taskId: painting.setId, stage: 'exam', answers: [], attemptId: 'started-attempt' }]);
  assert.equal(progress.status, 'In progress');
  assert.equal(progress.answered, 0);
  assert.equal(progress.drafts[0].attemptId, 'started-attempt');
  assert.equal(setProgress(painting, [], [{ taskId: painting.setId, stage: 'intro', answers: [] }]).status, 'Not started');
});

test('retained page and line locators point to original question numbers, including PDF line splits', () => {
  const report = JSON.parse(fs.readFileSync(new URL('../../shared/question-bank/import-report.json', import.meta.url)));
  const pages = JSON.parse(fs.readFileSync(new URL('../../shared/question-bank/sources/repeat-pdf-pages.json', import.meta.url)));
  const lines = fs.readFileSync(new URL('../../shared/question-bank/sources/repeat-text.txt', import.meta.url), 'utf8').split(/\r?\n/);
  const doc = fs.readFileSync(new URL('../../shared/question-bank/sources/interview-document.txt', import.meta.url), 'utf8').split(/\r?\n/);
  for (const set of QUESTION_SETS) for (const question of set.questions) for (const ref of question.sourceRefs) {
    const source = report.sources.find(source => source.sourceId === ref.sourceId);
    const line = source.name.endsWith('.pdf') ? pages[ref.page - 1].split(/\r?\n/)[ref.line - 1] : source.name.endsWith('.docx') ? doc[ref.line - 1] : lines[ref.line - 1];
    assert.match(line, new RegExp(`(?:^|\\s)${question.questionOrder}\\.`), `${question.questionId} has an incorrect source locator`);
  }
});
