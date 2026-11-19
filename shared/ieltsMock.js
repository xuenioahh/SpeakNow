// Creates a versioned sequence from existing questions; never generates source questions.
export function buildIeltsMock(getTask, availableSets, demo = false, theme = 'skills') {
  const part1 = demo ? [getTask(theme === 'travel' ? 'sample-ielts-travel-part1' : 'sample-ielts-part1')] : ['Studies', 'Home & Accommodation'].map(name => getTask(availableSets.find(set => set.exam === 'ielts' && set.taskType === 'ielts-part1' && set.setTitle.startsWith(name))?.setId));
  const part2 = getTask(demo ? (theme === 'travel' ? 'sample-ielts-travel-part2' : 'sample-ielts-part2') : availableSets.find(set => set.taskType === 'ielts-part2' && set.setTitle.startsWith('Saving money'))?.setId);
  const part3 = part2?.relatedSetId ? getTask(part2.relatedSetId) : null;
  if (part1.some(task => !task) || !part2 || !part3) return null;
  const questions = [], steps = [];
  const append = (task, part, limit, answerSeconds) => task.questions.slice(0, limit).forEach((question, index) => {
    questions.push({ ...question, sourceSetId: task.id });
    const originalStep = task.steps?.[index];
    steps.push({ type: originalStep?.type || `part${part}`, part,
      preparationSeconds: part === 2 ? originalStep?.preparationSeconds || 0 : 0,
      answerSeconds: part === 2 ? originalStep?.answerSeconds || 120 : answerSeconds, sourceSetId: task.id });
  });
  part1.forEach(task => append(task, 1, demo ? 6 : 3, 45));
  append(part2, 2, demo ? 2 : 1, 120);
  append(part3, 3, 5, Math.floor(270 / Math.min(5, part3.questions.length)));
  return { id: theme === 'travel' ? 'ielts-full-mock-travel-v1' : demo ? 'ielts-full-mock-demo-v1' : 'ielts-full-mock-bank-v1', exam: 'ielts', examVersion: 'current', type: 'ielts-mock', isFullMock: true,
    title: theme === 'travel' ? 'IELTS Speaking · Travel mock' : 'IELTS Speaking · Full Mock Test', prompts: questions.map(question => question.questionText), questions, steps,
    timing: { preparationSeconds: 0, answerSeconds: 45, basis: 'Part 1 and Part 3 target 4–5 minutes each; Part 2 includes 1 minute preparation and up to 2 minutes speaking.' },
    partLimits: { 1: 300, 2: 240, 3: 300 },
    source: { kind: demo ? 'original' : 'user-supplied-pdf', label: demo ? 'SpeakNow original simulation' : 'User-supplied IELTS practice · September–December 2026', version: 1 },
    audio: null, instructions: null, cuePoints: null, setId: null, bankTaskType: null, setTitle: null, relatedSetId: null,
    criteria: ['Fluency and Coherence', 'Lexical Resource', 'Grammatical Range and Accuracy', 'Pronunciation'] };
}
