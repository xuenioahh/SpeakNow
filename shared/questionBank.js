import { SAMPLE_SETS } from './sampleBanks.js';
import { initialSets } from './questionBankData.js';
export const TOEFL_TASK_TYPES = [
  { id: 'repeat', title: 'Listen and Repeat', description: 'Listen to sentences and repeat them accurately.' },
  { id: 'interview', title: 'Take an Interview', description: 'Answer questions in a simulated interview.' }
];
export const IELTS_TASK_TYPES = [
  { id: 'ielts-part1', title: 'Part 1', description: 'Answer questions about your life, studies, work and familiar topics.' },
  { id: 'ielts-part2', title: 'Part 2', description: 'Prepare for one minute, then speak for up to two minutes using a cue card.' },
  { id: 'ielts-part3', title: 'Part 3', description: 'Discuss ideas, explain your views and explore topics related to Part 2.' }
];
export const BANK_TASK_TYPES = [...TOEFL_TASK_TYPES, ...IELTS_TASK_TYPES];
export let QUESTION_SETS = [];
export let IELTS_QUESTION_SETS = [];
export let ALL_QUESTION_SETS = [];
const sets = new Map(), questions = new Map();
export function replaceQuestionCatalogue(catalogue) {
  const available = new Map([...SAMPLE_SETS, ...catalogue].map(set => [set.setId, set]));
  ALL_QUESTION_SETS = [...available.values()].map(set => ({
    exam: 'toefl', relatedSetId: null, categories: [set.category], accessLevel: 'private-source', ...set,
    questions: set.questions.map(question => ({ cuePoints: null, sourceLanguage: 'en', referenceAlternatives: [], ...question }))
  }));
  QUESTION_SETS = ALL_QUESTION_SETS.filter(set => set.exam !== 'ielts' && !set.isDemo);
  IELTS_QUESTION_SETS = ALL_QUESTION_SETS.filter(set => set.exam === 'ielts' && !set.isDemo);
  sets.clear(); questions.clear();
  for (const set of ALL_QUESTION_SETS) {
    sets.set(set.setId, set);
    for (const question of set.questions) questions.set(question.questionId, question);
  }
}
replaceQuestionCatalogue([...initialSets, ...SAMPLE_SETS]);
export const getQuestionSet = id => sets.get(id) || null;
export const getBankQuestion = id => questions.get(id) || null;
export const questionBankPath = type => `/exam/bank/${type}`;
export const examHomePath = exam => exam === 'ielts' ? '/exam/ielts' : '/exam';

export function getBankTask(id) {
  const set = getQuestionSet(id);
  if (!set) return null;
  const repeat = set.taskType === 'repeat';
  const name = BANK_TASK_TYPES.find(type => type.id === set.taskType)?.title;
  if (!name) return null;
  if (set.exam === 'ielts') {
    const type = set.taskType.replace('ielts-', '');
    const preparationSeconds = type === 'part2' ? 60 : 0;
    const answerSeconds = type === 'part2' ? 120 : type === 'part1' ? 60 : 90;
    return {
      id: set.setId, setId: set.setId, bankTaskType: set.taskType, exam: 'ielts', examVersion: 'current',
      type, title: `IELTS ${name} · ${set.setTitle}`, setTitle: set.setTitle,
      prompts: set.questions.map(question => question.questionText), questions: set.questions,
      timing: { preparationSeconds, answerSeconds, basis: type === 'part2' ? '1 minute preparation; up to 2 minutes speaking' : 'Per-answer practice cap; not the duration of the official part' },
      steps: set.steps || set.questions.map(() => ({ type, preparationSeconds, answerSeconds })),
      source: { kind: set.sourceType, label: set.isDemo ? 'SpeakNow original simulation' : 'User-supplied IELTS practice · September–December 2026', version: set.sourceVersion, fingerprint: set.sourceFingerprint, sourceDate: set.sourceDate },
      audio: null, instructions: null, cuePoints: set.questions[0]?.cuePoints || null,
      relatedSetId: set.relatedSetId || null,
      criteria: ['Fluency and Coherence', 'Lexical Resource', 'Grammatical Range and Accuracy', 'Pronunciation']
    };
  }
  return {
    id: set.setId, setId: set.setId, bankTaskType: set.taskType, exam: 'toefl', examVersion: '2026-01-21',
    type: repeat ? 'listen-repeat' : 'interview', title: `${name} · ${set.setTitle}`, setTitle: set.setTitle,
    prompts: set.questions.map(question => question.questionText), questions: set.questions,
    timing: { preparationSeconds: 0, answerSeconds: repeat ? 12 : 45, basis: 'Practice response limit' },
    steps: set.questions.map((_, index) => ({ type: repeat ? 'listen-repeat' : 'interview', preparationSeconds: 0,
      answerSeconds: repeat ? index < 2 ? 8 : index < 4 ? 10 : 12 : 45 })),
    source: { kind: set.sourceType, label: set.isDemo ? 'SpeakNow original simulation' : 'User-supplied recalled practice', version: set.sourceVersion,
      fingerprint: set.sourceFingerprint, sourceDate: set.sourceDate },
    audio: null, instructions: null, cuePoints: null, relatedSetId: null,
    criteria: repeat ? ['Exact transcript reproduction; omissions, additions, substitutions and word order'] : ['Relevance', 'Elaboration', 'Vocabulary and grammar']
  };
}

export function examPath(task, { questionIndex = null, parentId = '', focus = '', session = '', part = '', stage = 'prepare', sessionMode = '' } = {}) {
  const params = task.setId ? new URLSearchParams({ taskType: task.bankTaskType, setId: task.setId, scope: questionIndex === null ? 'set' : 'question' }) : new URLSearchParams({ task: task.id });
  if (questionIndex !== null) {
    if (task.setId) params.set('questionId', task.questions[questionIndex].questionId);
    else params.set('question', String(questionIndex));
  }
  if (part) params.set('part', String(part));
  if (parentId) params.set('retry', parentId);
  if (focus) params.set('focus', focus);
  if (session) params.set('session', session);
  if (sessionMode) params.set('sessionMode', sessionMode);
  return `/exam/${stage}?${params}`;
}

// Never fall back to a default task when a supplied bank selection is invalid.
export function bankSelection(params) {
  const setId = params.get('setId'), questionId = params.get('questionId');
  const question = questionId ? getBankQuestion(questionId) : null;
  const task = getBankTask(setId || question?.setId);
  if (!task || questionId && (!question || question.setId !== task.setId) ||
    params.has('taskType') && params.get('taskType') !== task.bankTaskType ||
    params.has('task') && params.get('task') !== task.id) return null;
  const scope = params.get('scope') || (questionId ? 'question' : 'set');
  if (!['set', 'question'].includes(scope) || (scope === 'question') !== Boolean(questionId)) return null;
  return { task, questionIndex: question ? task.questions.findIndex(item => item.questionId === questionId) : null };
}

export function setProgress(set, attempts, drafts) {
  const completed = new Set();
  for (const attempt of [...attempts, ...drafts].filter(item => item.taskId === set.setId)) {
    for (const answer of attempt.answers || []) {
      const question = set.questions[answer.questionIndex];
      if (question && (!answer.questionId || answer.questionId === question.questionId) && (answer.text?.trim() || answer.recordingId)) completed.add(question.questionId);
    }
  }
  const unfinished = drafts.filter(draft => draft.taskId === set.setId && (draft.stage === 'exam' || draft.answers?.length || draft.recordingId || draft.text?.trim()));
  return { answered: completed.size, total: set.questions.length, completed, drafts: unfinished,
    status: completed.size === set.questions.length ? 'Completed' : completed.size || unfinished.length ? 'In progress' : 'Not started' };
}
