// Align retries by the original question, even when a single-question retry is
// compared with a whole mock. Only send the excerpts for submitted answers.
export function retryPairs(attempt, previous) {
  if (!previous || attempt.track !== 'exam' || !attempt.parentId || previous.id !== attempt.parentId ||
      previous.taskId !== attempt.taskId || !Array.isArray(previous.answers)) return [];
  const pairs = [];
  for (const [answerIndex, answer] of attempt.answers.entries()) {
    const earlier = previous.answers.find(item => item?.questionIndex === answer.questionIndex && item.prompt === answer.prompt);
    if (typeof earlier?.text !== 'string' || !earlier.text.trim() || !answer.text?.trim()) continue;
    pairs.push({ answerIndex, questionIndex: answer.questionIndex, before: earlier.text.slice(0, 400), after: answer.text.slice(0, 400) });
    if (pairs.length === 4) break;
  }
  return pairs;
}

export function supportedChange(change, pairs) {
  const pair = pairs.find(item => item.answerIndex === change?.answerIndex);
  if (!pair || pair.before === pair.after) return null;
  const fields = ['beforeQuote', 'afterQuote', 'observation'];
  if (!fields.every(key => typeof change[key] === 'string' && change[key].trim() && change[key].length <= 500)) return null;
  if (change.beforeQuote === change.afterQuote || !pair.before.includes(change.beforeQuote) || !pair.after.includes(change.afterQuote)) return null;
  return { answerIndex: pair.answerIndex, beforeQuote: change.beforeQuote, afterQuote: change.afterQuote, observation: change.observation };
}

export function examQuestionLabel(task, answer) {
  const step = task?.steps?.[answer.questionIndex];
  const part = step?.part || Number(/^part([1-3])/.exec(step?.type || task?.type || '')?.[1]);
  if (part) return `IELTS Part ${part} · Question ${answer.questionIndex + 1}`;
  return `${(step?.type || task?.type) === 'listen-repeat' ? 'Sentence' : 'Question'} ${answer.questionIndex + 1}`;
}
