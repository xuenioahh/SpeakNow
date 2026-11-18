import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { IELTS_QUESTION_SETS, QUESTION_SETS, ALL_QUESTION_SETS, getBankTask, bankSelection, examPath, setProgress } from '../../shared/questionBank.js';
import { validateAttempt } from '../../shared/speakingTasks.js';

const byType = type => IELTS_QUESTION_SETS.filter(set => set.taskType === `ielts-${type}`);
const find = (type, name) => byType(type).find(set => set.setTitle.startsWith(name));
const attempt = (set, questionIndex, extra = {}) => ({ id: randomUUID(), track: 'exam', taskId: set.setId, practiceMode: 'quick', answers: [{ questionIndex, text: 'I learned to save money by bringing lunch from home.', recordingId: randomUUID(), inputMode: 'voice' }], ...extra });

test('IELTS imports both supplied PDFs with distinct questions and retains the TOEFL bank', () => {
  assert.deepEqual(['part1', 'part2', 'part3'].map(type => [byType(type).length, byType(type).flatMap(set => set.questions).length]), [[47, 362], [36, 39], [28, 134]]);
  assert.equal(QUESTION_SETS.length, 126);
  assert.equal(QUESTION_SETS.flatMap(set => set.questions).length, 628);
  assert.equal(new Set(ALL_QUESTION_SETS.map(set => set.setId)).size, ALL_QUESTION_SETS.length);
  const questions = ALL_QUESTION_SETS.flatMap(set => set.questions);
  assert.equal(new Set(questions.map(question => question.questionId)).size, questions.length);
  const pages = { 'ielts-part1-pdf': 9, 'ielts-complete-pdf': 69 };
  for (const set of IELTS_QUESTION_SETS) for (const q of set.questions) {
    assert.ok(q.questionText.trim() && q.rawText && !/TBC|P2\.|命中率|考官答案/.test(q.questionText));
    assert.equal(q.setId, set.setId);
    assert.ok(q.sourceRefs.every(ref => ref.page > 0 && ref.page <= pages[ref.sourceId]));
  }
});

test('every selected question and retry roundtrips through bank URLs and backend validation', () => {
  for (const set of IELTS_QUESTION_SETS) {
    const task = getBankTask(set.setId);
    assert.equal(task.exam, 'ielts');
    for (let index = 0; index < set.questions.length; index++) {
      const params = new URL(examPath(task, { questionIndex: index, parentId: 'parent-ielts-attempt', session: 'resume-ielts-attempt' }), 'http://test').searchParams;
      assert.equal(bankSelection(params).questionIndex, index);
      assert.equal(params.get('retry'), 'parent-ielts-attempt');
      assert.equal(params.get('session'), 'resume-ielts-attempt');
      const saved = validateAttempt(attempt(set, index));
      assert.equal(saved.exam, 'ielts');
      assert.equal(saved.questionId, set.questions[index].questionId);
      assert.equal(saved.answers[0].prompt, set.questions[index].questionText);
      assert.equal(saved.taskSnapshot.steps[index].type, task.type);
    }
    assert.equal(bankSelection(new URL(examPath(task), 'http://test').searchParams).questionIndex, null);
  }
});

test('Part 2 uses per-card cues and 60/120-second stages, with matching Part 3 links', () => {
  for (const set of byType('part2')) {
    const task = getBankTask(set.setId);
    assert.ok(task.steps.every(step => step.preparationSeconds === 60 && step.answerSeconds === 120 && step.type === 'part2'));
    assert.ok(task.questions.every(question => question.cuePoints.length >= 3));
    if (set.relatedSetId) {
      const related = getBankTask(set.relatedSetId);
      assert.equal(related.type, 'part3');
      assert.equal(related.relatedSetId, set.setId);
      assert.equal(related.setTitle, set.setTitle);
    }
  }
  const food = getBankTask(find('part2', 'Special food').setId);
  assert.equal(food.questions.length, 2);
  assert.notDeepEqual(food.questions[0].cuePoints, food.questions[1].cuePoints);
});

test('wrong exams, crossed questions, duplicate answers and multi-answer quick sessions are rejected', () => {
  const first = find('part1', 'Studies'), second = find('part2', 'Saving money');
  for (const values of [
    { setId: first.setId, taskType: 'interview' },
    { setId: first.setId, questionId: second.questions[0].questionId },
    { setId: first.setId, scope: 'question' }
  ]) assert.equal(bankSelection(new URLSearchParams(values)), null);
  const value = attempt(first, 1);
  assert.throws(() => validateAttempt({ ...value, taskType: 'repeat' }), /selection/);
  assert.throws(() => validateAttempt({ ...value, answers: [{ ...value.answers[0], questionId: second.questions[0].questionId }] }), /different question/);
  assert.throws(() => validateAttempt({ ...value, answers: [value.answers[0], value.answers[0]] }), /twice/);
});

test('source corrections preserve wording, omit placeholders and avoid the misplaced shoe answer', () => {
  const politeness = find('part1', 'Politeness');
  assert.ok(politeness.questions.every(q => !/shoe|sneaker/i.test(`${q.questionText} ${q.referenceAnswer || ''}`)));
  assert.ok(politeness.questions.some(q => q.questionText === 'Did you learn to be polite when you are a child?' && q.referenceAnswer === null));
  const original = find('part1', 'Work');
  assert.ok(original.questions.some(q => q.questionText === 'What work do you you?'));
  const hometown = find('part1', 'Hometown');
  assert.ok(hometown.questions.some(q => q.questionText === 'Have you learned anything about the history of your hometown?'));
  const medical = find('part3', 'A medical professional');
  assert.equal(medical.questions.length, 3);
  assert.ok(medical.questions.every(q => !q.questionText.includes('The path is very long')));
  const report = JSON.parse(fs.readFileSync(new URL('../../shared/question-bank/ielts-import-report.json', import.meta.url)));
  assert.equal(report.notes.filter(note => note.issue.includes('TBC')).length, 2);
  assert.equal(report.duplicatesMerged, 131);
});

test('IELTS progress deduplicates retries, separates exams and resumes unanswered drafts', () => {
  const set = find('part1', 'Studies');
  const value = validateAttempt(attempt(set, 1));
  const progress = setProgress(set, [value, value], [{ taskId: set.setId, stage: 'exam', answers: [], attemptId: 'resumable-ielts-attempt' }]);
  assert.equal(progress.answered, 1);
  assert.equal(progress.status, 'In progress');
  assert.equal(progress.drafts.length, 1);
  assert.equal(setProgress(QUESTION_SETS[0], [value], []).answered, 0);
});
