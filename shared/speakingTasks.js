import { validateVisualEvidence } from './visualEvidence.js';
// Versioned, original practice material. Never presented as official test questions.
const part2FollowUp = 'Do you use this skill often?';
const source = {
  kind: 'original',
  label: 'SpeakNow original simulation',
  updatedAt: '2026-10-23',
  version: 1
};
const task = (id, exam, type, title, prompts, timing, extra = {}) => ({
  id,
  exam,
  examVersion: exam === 'toefl' ? '2026-01-21' : 'current',
  type,
  title,
  prompts,
  timing,
  source,
  audio: null,
  steps: null,
  instructions: null,
  cuePoints: null,
  criteria: null,
  ...extra
});
export const SPEAKING_TASKS = [task('toefl-repeat-campus-v1', 'toefl', 'listen-repeat', 'Listen and Repeat', ['The library opens at nine.', 'Please leave your bags beside the door.', 'You can borrow a laptop at the front desk.', 'The study rooms on the second floor are open until midnight.', 'Students should return their books before leaving for the winter break.', 'If you need help finding an article, the librarian can show you how to search the catalogue.', 'Although the main entrance is closed for repairs, students can still enter the building through the courtyard.'], {
  preparationSeconds: 0,
  answerSeconds: 12,
  basis: 'Practice limit; not a full official test simulation'
}, {
  instructions: 'Listen first, then repeat the sentence as accurately as you can. The reference stays hidden until you finish.',
  criteria: ['Reproduction accuracy (transcript)', 'Intelligibility (requires audio assessment)']
}), task('toefl-interview-campus-v1', 'toefl', 'interview', 'Take an Interview', ['What place on campus do you use most often, and what do you do there?', 'Describe a time when studying with another person helped you.', 'Do you think universities should provide more quiet study spaces or more social spaces? Why?', 'How might online learning change the way students use university campuses in the future?'], {
  preparationSeconds: 0,
  answerSeconds: 45,
  basis: '45 seconds per question; four related interview questions'
}, {
  criteria: ['Relevance and elaboration', 'Vocabulary and grammar', 'Pace and intelligibility (requires audio assessment)']
}), task('ielts-part1-study-v1', 'ielts', 'part1', 'Part 1 · Familiar topics', ['Do you work or are you a student?', 'What do you enjoy most about your work or studies?', 'Do you prefer studying alone or with other people? Why?'], {
  preparationSeconds: 0,
  answerSeconds: 60,
  basis: '60-second practice cap per answer; the official Part 1 lasts 4–5 minutes overall'
}), task('ielts-part2-skill-v1', 'ielts', 'part2', 'Part 2 · Long turn', ['Describe a useful skill you learned. Say what it was, when and how you learned it, and explain why it is useful to you.', part2FollowUp], {
  preparationSeconds: 60,
  answerSeconds: 120,
  basis: '1 minute preparation; up to 2 minutes speaking'
}, {
  cuePoints: ['What the skill was', 'When and how you learned it', 'Who helped you', 'Why it is useful'],
  followUp: part2FollowUp,
  source: { ...source, updatedAt: '2026-10-24', version: 2 },
  steps: [{ type: 'part2', answerSeconds: 120, preparationSeconds: 60 }, { type: 'part2-followup', answerSeconds: 30, preparationSeconds: 0 }],
  topic: 'Learning useful skills'
}), task('ielts-part3-learning-v1', 'ielts', 'part3', 'Part 3 · Discussion', ['Related to learning a useful skill: how has technology changed the way people learn practical skills?', 'Should schools prioritise practical skills or academic knowledge? Why?', 'Who should be responsible for helping adults learn new skills?'], {
  preparationSeconds: 0,
  answerSeconds: 90,
  basis: '90-second practice cap per answer; official Part 3 lasts 4–5 minutes overall'
}, {
  relatedTaskId: 'ielts-part2-skill-v1',
  topic: 'Learning useful skills'
})];
export const IELTS_CRITERIA = ['Fluency and Coherence', 'Lexical Resource', 'Grammatical Range and Accuracy', 'Pronunciation'];
export function getSpeakingTask(id) {
  if (id === 'toefl-mock-campus-v1') {
    const repeat = SPEAKING_TASKS[0], interview = SPEAKING_TASKS[1];
    return { ...repeat, id, type: 'mock', title: 'TOEFL 2026 · Speaking mock',
      prompts: [...repeat.prompts, ...interview.prompts],
      steps: [...repeat.prompts.map((_, index) => ({ type: repeat.type, answerSeconds: index < 2 ? 8 : index < 4 ? 10 : 12 })), ...interview.prompts.map(() => ({ type: interview.type, answerSeconds: 45 }))],
      timing: { preparationSeconds: 0, answerSeconds: 45, basis: '7 repetitions (8–12s), then 4 interview answers (45s); no preparation time.' },
      instructions: 'Original simulation. Listen once and answer immediately. Recording and progression are automatic. Browser speech playback replaces official recorded materials. No official score is assigned.',
      criteria: [...repeat.criteria, ...interview.criteria],
    };
  }
  return SPEAKING_TASKS.find(item => item.id === id) || null;
}
export const validAttemptId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);
export function validateAttempt(input) {
  if (!input || !validAttemptId(input.id)) throw new Error('Invalid attempt ID');
  const definition = input.track === 'exam' ? getSpeakingTask(input.taskId) : null;
  if (input.track !== 'daily' && !definition) throw new Error('Unknown speaking task');
  if (input.parentId && !validAttemptId(input.parentId)) throw new Error('Invalid retry relationship');
  if (!Array.isArray(input.answers) || !input.answers.length || input.answers.length > 30) throw new Error('Add an answer before saving');
  const answers = input.answers.map(answer => {
    if (!answer || typeof answer.text !== 'string' || (!answer.text.trim() && !(definition?.type === 'mock' && validAttemptId(answer.recordingId))) || answer.text.length > 8000) throw new Error('Each answer needs a transcript of 1–8000 characters');
    if (definition && (!Number.isInteger(answer.questionIndex) || !definition.prompts[answer.questionIndex])) throw new Error('Answer does not match this task');
    return {
      questionIndex: answer.questionIndex ?? 0,
      text: answer.text.trim(),
      prompt: definition ? definition.prompts[answer.questionIndex] : String(answer.prompt || '').slice(0, 2000),
      durationSeconds: Math.min(600, Math.max(0, Number(answer.durationSeconds) || 0)),
      startSeconds: Number.isFinite(answer.startSeconds) && answer.startSeconds >= 0 && answer.startSeconds <= 86400 ? answer.startSeconds : null,
      recordingId: validAttemptId(answer.recordingId) ? answer.recordingId : null,
      inputMode: answer.inputMode === 'voice' ? 'voice' : 'text'
    };
  });
  if (JSON.stringify(answers).length > 35000) throw new Error('Practice is too long; split it into shorter sessions');
  return {
    id: input.id,
    track: definition ? 'exam' : 'daily',
    taskId: definition?.id || String(input.taskId || 'daily').slice(0, 100),
    taskVersion: definition?.source.version || 1,
    examVersion: definition?.examVersion || null,
    taskSource: definition?.source || {
      kind: 'scenario',
      label: 'SpeakNow role-play',
      version: 1
    },
    taskSnapshot: definition ? JSON.parse(JSON.stringify(definition)) : null,
    exam: definition?.exam || 'daily',
    type: definition?.type || 'conversation',
    title: definition?.title || String(input.title || 'Daily Conversation').slice(0, 150),
    parentId: input.parentId || null,
    practiceMode: input.practiceMode === 'quick' ? 'quick' : definition?.type === 'mock' ? 'mock' : 'set',
    focus: String(input.focus || '').slice(0, 1000),
    answers,
    visualEvidence: definition ? null : validateVisualEvidence(input.visualEvidence),
    context: definition ? null : {
      scenario: String(input.context?.scenario || 'cafe').slice(0, 80),
      mode: input.context?.mode === 'advanced' ? 'advanced' : 'basic',
      dialogMode: input.context?.dialogMode === 'free_talk' ? 'free_talk' : 'goal_oriented'
    },
    createdAt: input.createdAt && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : new Date().toISOString()
  };
}
export function validateFeedback(value, attempt) {
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !Array.isArray(value.improvements) || value.improvements.length < 1 || value.improvements.length > 3) throw new Error('AI feedback was incomplete. Your answers are safe; try again.');
  const improvements = value.improvements.map(item => {
    if (!item || !Number.isInteger(item.answerIndex) || !attempt.answers[item.answerIndex]) throw new Error('Feedback cited an unknown answer');
    const fields = ['quote', 'reason', 'suggestion', 'exercise'];
    if (fields.some(key => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 1800)) throw new Error('Feedback was missing a concrete improvement');
    if (!attempt.answers[item.answerIndex].text.includes(item.quote)) throw new Error('Feedback evidence did not match your words. Try again.');
    return Object.fromEntries(['answerIndex', ...fields].map(key => [key, item[key]]));
  });
  return {
    summary: value.summary.slice(0, 2000),
    strengths: Array.isArray(value.strengths) ? value.strengths.filter(item => typeof item === 'string').slice(0, 3).map(item => item.slice(0, 600)) : [],
    improvements,
    basis: 'transcript-only',
    pronunciation: null,
    score: null
  };
}
// Ordered word alignment is a transcript comparison, never an acoustic score.
export function compareRepeat(reference, transcript) {
  const tokenize = text => String(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?|\d+/g) || [];
  const expected = tokenize(reference),
    actual = tokenize(transcript);
  const matrix = Array.from({
    length: expected.length + 1
  }, () => Array(actual.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i--) for (let j = actual.length - 1; j >= 0; j--) matrix[i][j] = expected[i] === actual[j] ? 1 + matrix[i + 1][j + 1] : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const missing = [],
    extra = [];
  let i = 0,
    j = 0;
  while (i < expected.length || j < actual.length) {
    if (i < expected.length && j < actual.length && expected[i] === actual[j]) {
      i++;
      j++;
    } else if (i < expected.length && (j === actual.length || matrix[i + 1][j] >= matrix[i][j + 1])) missing.push(expected[i++]);else extra.push(actual[j++]);
  }
  const possibleReordered = [];
  const unmatchedExtra = [...extra];
  const omissions = missing.filter(word => {
    const at = unmatchedExtra.indexOf(word);
    if (at < 0) return true;
    possibleReordered.push(word); unmatchedExtra.splice(at, 1); return false;
  });
  // Order-sensitive transcript alignment; ASR errors and repeated words can be ambiguous.
  const substitutions = omissions.slice(0, Math.min(omissions.length, unmatchedExtra.length)).map((word,index) => ({ reference: word, spoken: unmatchedExtra[index] }));
  return {
    possibleReordered,
    substitutions,
    omissions: omissions.slice(substitutions.length),
    additions: unmatchedExtra.slice(substitutions.length),
    matched: matrix[0][0],
    expected: expected.length,
    missing,
    extra
  };
}
