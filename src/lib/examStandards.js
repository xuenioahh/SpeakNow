export const EXAM_STANDARDS_VERSION = '2026-09-18';

export const EXAM_STANDARDS = {
  ielts: {
    label: 'IELTS Speaking', max: 9, step: 0.5,
    criteria: [
      { key: 'Fluency', label: 'Fluency & Coherence', focus: 'Keep going, link ideas, and develop answers with a reason, example or result.' },
      { key: 'Lexical', label: 'Lexical Resource', focus: 'Use a flexible, precise range of words; paraphrase when a word is missing.' },
      { key: 'Grammar', label: 'Grammatical Range & Accuracy', focus: 'Combine simple and complex structures while keeping errors from blocking meaning.' },
      { key: 'Pronunciation', label: 'Pronunciation', focus: 'Make speech easy to understand with intelligible sounds, word stress, rhythm and intonation.' },
    ],
    strategy: 'Answer the question directly, extend with a reason or example, and self-correct only when it helps clarity. IELTS rates average performance across the speaking test; one short exchange is a practice estimate, not an official band score.',
    bands: { 9: 'Fully flexible and precise; effortless to understand.', 8: 'Fluent and coherent with only occasional lapses.', 7: 'Long turns and clear development with some hesitation or errors.', 6: 'Generally effective, but complexity, precision or coherence may break down.', 5: 'Basic communication; repetition, limited range or frequent errors can affect development.' },
  },
  toefl: {
    label: 'TOEFL iBT Speaking', max: 6, step: 0.5,
    criteria: [
      { key: 'Fluency', label: 'Delivery & Intelligibility', focus: 'Maintain a natural pace; pauses, pronunciation, rhythm and intonation should not obscure meaning.' },
      { key: 'Lexical', label: 'Language Use: Vocabulary', focus: 'Use accurate vocabulary that expresses the intended academic or campus meaning.' },
      { key: 'Grammar', label: 'Language Use: Grammar', focus: 'Control grammar sufficiently to express connected ideas clearly.' },
      { key: 'Task', label: 'Topic Development', focus: 'Address the task, organize the response, and support the main point with relevant details.' },
    ],
    strategy: 'For the current 2026 test, practise Listen and Repeat plus Take an Interview. Answer the question, keep a steady pace, and support the point with specific details. This app reports a 1–6 practice estimate; it does not reproduce ETS AI/rater scoring.',
    bands: { 6: 'Advanced: fluent, precise and effective across academic/campus contexts.', 5: 'High proficiency: clear, well-supported responses with strong control.', 4: 'Intermediate: generally clear and relevant, but lapses may affect completeness or precision.', 3: 'Basic: familiar-topic communication with noticeable limits in development or control.', 2: 'Limited: short, hesitant responses with frequent language or intelligibility problems.', 1: 'Minimal: very limited evidence of effective spoken communication.' },
  },
  daily: {
    label: 'Daily speaking', max: 10, step: 1,
    criteria: [
      { key: 'Fluency', label: 'Fluency', focus: 'Keep a natural conversational flow.' },
      { key: 'Lexical', label: 'Vocabulary', focus: 'Choose specific words for the situation.' },
      { key: 'Grammar', label: 'Grammar', focus: 'Make the meaning clear and accurate.' },
      { key: 'Pronunciation', label: 'Pronunciation', focus: 'Stay understandable to your listener.' },
    ],
    strategy: 'Use one clear point, one supporting detail and one natural follow-up question.', bands: {},
  },
};

export function getExamStandard(scoring = 'daily') { return EXAM_STANDARDS[scoring] || EXAM_STANDARDS.daily; }

export function scoreStep(scoring = 'daily') { return getExamStandard(scoring).step; }

export function scoreMax(scoring = 'daily') { return getExamStandard(scoring).max; }

export function roundExamScore(value, scoring = 'daily') {
  const standard = getExamStandard(scoring);
  if (value == null || !['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const step = standard.step;
  return Math.round(Math.max(0, Math.min(standard.max, n)) / step) * step;
}

export function normalizeExamScore(value, scoring = 'daily', { legacyToefl = false } = {}) {
  if (value == null || !['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (scoring === 'toefl' && (legacyToefl || n > 6)) {
    return roundExamScore(1 + (Math.max(0, Math.min(30, n)) / 30) * 5, scoring);
  }
  return roundExamScore(n, scoring);
}

export function getScoreDescriptor(value, scoring = 'daily') {
  const standard = getExamStandard(scoring);
  if (!standard.bands || !Object.keys(standard.bands).length) return '';
  const keys = Object.keys(standard.bands).map(Number).sort((a, b) => b - a);
  const match = keys.find(key => Number(value) >= key) || keys[keys.length - 1];
  return standard.bands[match];
}
