import { validateVisualEvidence } from './visualEvidence.js';
import { validateDailyEvidence, validateDeliveryFeedback } from './dailyEvidence.js';
import { getBankTask, ALL_QUESTION_SETS } from './questionBank.js';
import { buildIeltsMock } from './ieltsMock.js';
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
  setId: null,
  bankTaskType: null,
  setTitle: null,
  relatedSetId: null,
  questions: null,
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
const ownedSnapshots = new Map();
export function registerTaskSnapshot(task) { if (task?.id && Array.isArray(task.prompts) && task.prompts.length <= 30) ownedSnapshots.set(task.id, task); }
export function getSpeakingTask(id) {
  if (id === 'ielts-full-mock-travel-v1') return buildIeltsMock(getBankTask, ALL_QUESTION_SETS, true, 'travel');
  if (id === 'ielts-full-mock-demo-v1' || id === 'ielts-full-mock-bank-v1') return buildIeltsMock(getBankTask, ALL_QUESTION_SETS, id.includes('-demo-')) || ownedSnapshots.get(id) || null;
  if (typeof id === 'string' && id.startsWith('paired-')) {
    const cue = getBankTask(id.slice(7));
    const discussion = cue?.relatedSetId && getBankTask(cue.relatedSetId);
    if (!cue || cue.type !== 'part2' || discussion?.type !== 'part3' || cue.source.kind !== discussion.source.kind) return ownedSnapshots.get(id) || null;
    return { ...cue, id, setId: null, bankTaskType: null, relatedSetId: null, type: 'ielts-paired',
      title: 'IELTS Parts 2 & 3 · ' + cue.setTitle, setTitle: cue.setTitle,
      prompts: [...cue.prompts, ...discussion.prompts], questions: [...cue.questions, ...discussion.questions],
      steps: [...cue.steps.map(step => ({ ...step, part: 2 })), ...discussion.steps.map(step => ({ ...step, part: 3 }))] };
  }
  const bankTask = getBankTask(id);
  if (bankTask) return bankTask;
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
  return SPEAKING_TASKS.find(item => item.id === id) || ownedSnapshots.get(id) || null;
}
export const validAttemptId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);
export function validateAttempt(input) {
  if (!input || !validAttemptId(input.id)) throw new Error('Invalid attempt ID');
  const definition = input.track === 'exam' ? getSpeakingTask(input.taskId) : null;
  if (input.track !== 'daily' && !definition) throw new Error('Unknown speaking task');
  if (input.parentId && !validAttemptId(input.parentId)) throw new Error('Invalid retry relationship');
  if (!Array.isArray(input.answers) || !input.answers.length || (definition && input.answers.length > 30)) throw new Error('Add an answer before saving');
  const answers = input.answers.map(answer => {
    if (!answer || typeof answer.text !== 'string' || (!answer.text.trim() && !validAttemptId(answer.recordingId)) || answer.text.length > 8000) throw new Error('Each answer needs a transcript or a recording');
    if (definition && (!Number.isInteger(answer.questionIndex) || !definition.prompts[answer.questionIndex])) throw new Error('Answer does not match this task');
    const question = definition?.questions?.[answer.questionIndex];
    if (question && answer.questionId && answer.questionId !== question.questionId) throw new Error('Answer belongs to a different question');
    return {
      questionIndex: answer.questionIndex ?? 0,
      ...(definition?.steps?.[answer.questionIndex]?.part ? { part: definition.steps[answer.questionIndex].part } : {}),
      ...(!definition && typeof answer.turnId === 'string' ? { turnId: answer.turnId.slice(0,80) } : {}),
      ...(question ? { questionId: question.questionId, setId: definition.setId } : {}),
      text: answer.text.trim(),
      rawTranscript: typeof answer.rawTranscript === "string" ? answer.rawTranscript.slice(0, 8000) : null,
      prompt: definition ? definition.prompts[answer.questionIndex] : String(answer.prompt || '').slice(0, 2000),
      durationSeconds: Math.min(600, Math.max(0, Number(answer.durationSeconds) || 0)),
      startSeconds: Number.isFinite(answer.startSeconds) && answer.startSeconds >= 0 && answer.startSeconds <= 86400 ? answer.startSeconds : null,
      recordingId: validAttemptId(answer.recordingId) ? answer.recordingId : null,
      inputMode: answer.inputMode === 'voice' ? 'voice' : 'text'
    };
  });
  if (definition) {
    if (input.setId && input.setId !== definition.setId || input.taskType && input.taskType !== definition.bankTaskType) throw new Error('Practice selection does not match this question set');
    if (new Set(answers.map(answer => answer.questionIndex)).size !== answers.length) throw new Error('An answer was submitted twice');
    if (input.practiceMode === 'quick' && answers.length !== 1) throw new Error('Single-question practice needs exactly one answer');
  }
  if (definition?.type === 'ielts-mock' && input.part && answers.some(answer => answer.part !== Number(input.part))) throw new Error('Answer belongs to a different IELTS part');
  const selectedPrompts = definition ? definition.prompts.map((_, index) => index).filter(index => !input.part || definition.steps?.[index]?.part === Number(input.part)) : [];
  if (definition && JSON.stringify(answers).length > 35000) throw new Error('Practice is too long; split it into shorter sessions');
  const turns = definition ? [] : (Array.isArray(input.turns) ? input.turns.flatMap(turn => {
    if (!['ai', 'user'].includes(turn?.role) || typeof turn.content !== 'string' || !turn.content.trim()) return [];
    return [{ role: turn.role, content: turn.content.trim().slice(0, 8000),
      turnId: typeof turn.turnId === 'string' ? turn.turnId.slice(0,80) : null,
      sessionId: validAttemptId(turn.sessionId) ? turn.sessionId : input.id,
      startedAt: Number.isFinite(turn.startedAt) ? turn.startedAt : null,
      endedAt: Number.isFinite(turn.endedAt) ? turn.endedAt : null,
      recordingId: validAttemptId(turn.recordingId) ? turn.recordingId : null }];
  }) : []);
  return {
    id: input.id,
    track: definition ? 'exam' : 'daily',
    taskId: definition?.id || String(input.taskId || 'daily').slice(0, 100),
    ...(definition?.setId ? { setId: definition.setId, taskType: definition.bankTaskType,
      scope: input.practiceMode === 'quick' ? 'question' : 'set', questionId: input.practiceMode === 'quick' ? answers[0].questionId : null,
      completed: input.practiceMode === 'quick' ? answers.length === 1 : new Set(answers.map(answer => answer.questionIndex)).size === definition.prompts.length } : {}),
    part: definition?.type === 'ielts-mock' && [1, 2, 3].includes(Number(input.part)) ? Number(input.part) : null,
    examinerTurns: definition?.type === 'ielts-mock' && Array.isArray(input.examinerTurns) ? input.examinerTurns.filter(turn => typeof turn.text === 'string').slice(0, 30).map(turn => ({ questionIndex: turn.questionIndex, text: turn.text.slice(0, 1800), source: turn.source === 'ai' ? 'ai' : 'script' })) : [],
    ...(definition ? { completed: input.practiceMode === 'quick' ? answers.length === 1 : selectedPrompts.every(index => answers.some(answer => answer.questionIndex === index)) } : {}),
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
    practiceMode: input.practiceMode === 'quick' ? 'quick' : (definition?.type === 'mock' || definition?.type === 'ielts-mock') ? 'mock' : 'set',
    sessionMode: input.sessionMode === 'exam' ? 'exam' : 'practice',
    focus: String(input.focus || '').slice(0, 1000),
    answers,
    turns,
    multimodalEvidence: definition ? [] : validateDailyEvidence(input.multimodalEvidence, answers),
    visualEvidence: definition ? null : validateVisualEvidence(input.visualEvidence),
    context: definition ? null : {
      scenario: String(input.context?.scenario || 'cafe').slice(0, 80),
      cue: String(input.context?.cue || '').slice(0, 80),
      mode: input.context?.mode === 'advanced' ? 'advanced' : 'basic',
      dialogMode: input.context?.dialogMode === 'free_talk' ? 'free_talk' : 'goal_oriented'
    },
    createdAt: input.createdAt && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : new Date().toISOString()
  };
}
export function validateFeedback(value, attempt) {
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !Array.isArray(value.improvements) || value.improvements.length > 3) throw new Error('AI feedback was incomplete. Your answers are safe; try again.');
  const improvements = value.improvements.map(item => {
    if (!item || !Number.isInteger(item.answerIndex) || !attempt.answers[item.answerIndex]) throw new Error('Feedback cited an unknown answer');
    const fields = ['quote', 'reason', 'suggestion', 'exercise'];
    if (fields.some(key => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 1800)) throw new Error('Feedback was missing a concrete improvement');
    if (!attempt.answers[item.answerIndex].text.includes(item.quote)) throw new Error('Feedback evidence did not match your words. Try again.');
    const answer = attempt.answers[item.answerIndex];
    return { ...Object.fromEntries(['answerIndex', ...fields].map(key => [key, item[key]])),
      evidence: { quote: item.quote, utteranceId: `answer-${item.answerIndex}`, startMs: answer.startSeconds === null ? null : Math.round(answer.startSeconds * 1000), endMs: answer.startSeconds === null || !answer.durationSeconds ? null : Math.round((answer.startSeconds + answer.durationSeconds) * 1000) } };
  });
  const dimensions = {};
  for (const key of ['coherence', 'lexical', 'grammar']) {
    const item = value.dimensions?.[key];
    if (item && typeof item.observation === 'string' && typeof item.quote === 'string' && item.quote.trim() && Number.isInteger(item.answerIndex) && attempt.answers[item.answerIndex]?.text.includes(item.quote)) {
      dimensions[key] = { observation: item.observation.slice(0, 800), quote: item.quote.slice(0, 1000), answerIndex: item.answerIndex, suggestion: typeof item.suggestion === 'string' ? item.suggestion.slice(0, 800) : '' };
    }
  }
  const rating = value.communicationClarity;
  const communicationClarity = attempt.track === 'daily' && ['unclear', 'understandable', 'clear'].includes(rating?.level)
    && Number.isInteger(rating.answerIndex) && typeof rating.quote === 'string' && rating.quote.trim()
    && attempt.answers[rating.answerIndex]?.text.includes(rating.quote) && typeof rating.reason === 'string' && rating.reason.trim()
    ? { level: rating.level, answerIndex: rating.answerIndex, quote: rating.quote.slice(0, 1000), reason: rating.reason.slice(0, 800) } : null;
  const seenParts = new Set();
  const parts = (Array.isArray(value.parts) ? value.parts : []).flatMap(item => {
    const answer = attempt.answers[item?.answerIndex], part = attempt.taskSnapshot?.steps?.[answer?.questionIndex]?.part;
    if (![1, 2, 3].includes(item?.part) || item.part !== part || seenParts.has(part) || typeof item.summary !== 'string' || typeof item.quote !== 'string' || !item.quote.trim() || !answer.text.includes(item.quote)) return [];
    seenParts.add(part); return [{ part, summary: item.summary.slice(0, 1000), answerIndex: item.answerIndex, quote: item.quote.slice(0, 1000) }];
  });
  const deliveryImprovements = attempt.track === 'daily' ? validateDeliveryFeedback(value.deliveryImprovements, attempt) : [];
  return {
    dimensions, parts,
    ...(attempt.track === 'daily' ? { deliveryImprovements, communicationClarity } : {}),
    summary: value.summary.slice(0, 2000),
    strengths: Array.isArray(value.strengths) ? value.strengths.filter(item => typeof item === 'string').slice(0, 3).map(item => item.slice(0, 600)) : [],
    improvements,
    basis: deliveryImprovements.length ? 'transcript-and-device-observations' : 'transcript-only',
    unassessedDimensions: ['pronunciation', 'intonation', 'audio pauses', 'video behavior'],
    pronunciation: null,
    score: null
  };
}
// Ordered word alignment is a transcript comparison, never an acoustic score.
export function compareRepeat(reference, transcript) {
  const tokenize = text => String(text).normalize('NFKC').replace(/[‘’ʼ]/g, "'").toLowerCase().match(/\p{L}+(?:'\p{L}+)?|\d+/gu) || [];
  const expected = tokenize(reference),
    actual = tokenize(transcript);
  const matrix = Array.from({
    length: expected.length + 1
  }, () => Array(actual.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i--) for (let j = actual.length - 1; j >= 0; j--) matrix[i][j] = expected[i] === actual[j] ? 1 + matrix[i + 1][j + 1] : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const missing = [],
    extra = [];
  const runs = [];
  let run = { missing: [], extra: [] };
  let i = 0,
    j = 0;
  while (i < expected.length || j < actual.length) {
    if (i < expected.length && j < actual.length && expected[i] === actual[j]) {
      if (run.missing.length || run.extra.length) runs.push(run);
      run = { missing: [], extra: [] };
      i++;
      j++;
    } else if (i < expected.length && (j === actual.length || matrix[i + 1][j] >= matrix[i][j + 1])) {
      const word = expected[i++];
      missing.push(word); run.missing.push(word);
    } else {
      const word = actual[j++];
      extra.push(word); run.extra.push(word);
    }
  }
  if (run.missing.length || run.extra.length) runs.push(run);
  const possibleReordered = [];
  // Matching words in different runs may have moved; repeated words remain ambiguous.
  for (const part of runs) {
    part.missing = part.missing.filter(word => {
      const source = runs.find(other => other.extra.includes(word));
      if (!source) return true;
      possibleReordered.push(word);
      source.extra.splice(source.extra.indexOf(word), 1);
      return false;
    });
  }
  // Only pair replacements inside the same gap between matched words.
  // A word missing at the start and one added at the end are separate edits.
  const substitutions = [], omissions = [], additions = [];
  for (const part of runs) {
    const count = Math.min(part.missing.length, part.extra.length);
    for (let index = 0; index < count; index++) substitutions.push({ reference: part.missing[index], spoken: part.extra[index] });
    omissions.push(...part.missing.slice(count));
    additions.push(...part.extra.slice(count));
  }
  return {
    possibleReordered,
    substitutions,
    omissions,
    additions,
    matched: matrix[0][0],
    expected: expected.length,
    missing,
    extra
  };
}
