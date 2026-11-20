import { compareRepeat } from '../../shared/speakingTasks';
import { examQuestionLabel } from '../../shared/academicCoaching';

export default function AcademicFocus({ attempt, task, improvements, change, busy, onRetry }) {
  // Repetition can be coached directly from the target even without a model response.
  const repeats = attempt.answers.flatMap((answer, answerIndex) => {
    const type = task?.steps?.[answer.questionIndex]?.type || attempt.type;
    if (type !== 'listen-repeat' || !answer.text?.trim() || !answer.prompt) return [];
    const diff = compareRepeat(answer.prompt, answer.text);
    const edits = diff.omissions.length + diff.additions.length + diff.substitutions.length + diff.possibleReordered.length;
    return [{ answer, answerIndex, edits, diff }];
  });
  const repeat = !improvements.length && repeats.filter(item => item.edits).sort((a,b) => b.edits - a.edits)[0];
  function focusCard(item, index) {
    const answer = attempt.answers[item.answerIndex];
    return <article key={index} id={`improvement-${item.answerIndex}-${index}`} className="academic-coaching-card">
      <header><strong>{examQuestionLabel(task, answer)}</strong></header>
      <p className="coaching-prompt">{answer.prompt}</p>
      <dl><dt>Your words</dt><dd><q>{item.quote}</q></dd>
        <dt>What to work on</dt><dd>{item.reason}</dd>
        <dt>Try this change</dt><dd>{item.suggestion}</dd>
        {item.exampleRewrite && <><dt>One way to say it</dt><dd><q>{item.exampleRewrite}</q></dd></>}
      </dl>
      <p><strong>Next take</strong> · {item.exercise}</p>
      <button className="primary" disabled={busy} onClick={() => onRetry(item.exercise, item.answerIndex)}>Retry this question</button>
    </article>;
  }
  return <section id="review-improvements" className="academic-focus">
    {repeat && <article className="academic-coaching-card"><h3>Practise {examQuestionLabel(task, repeat.answer).toLowerCase()} again</h3>
      <p>This sentence has the most wording differences in your submitted repeats.</p>
      <dl><dt>Reference</dt><dd>{repeat.answer.prompt}</dd><dt>Your transcript</dt><dd>{repeat.answer.text}</dd></dl>
      <button className="primary" disabled={busy} onClick={() => onRetry('Listen again and match the wording of this sentence.', repeat.answerIndex)}>Retry this sentence</button></article>}
    {!improvements.length && repeats.length > 0 && !repeat && <p>The wording matched in all {repeats.length} transcribed {repeats.length === 1 ? 'sentence' : 'sentences'}.</p>}
    {change && <article className="academic-retry-change"><h3>What changed on your retry</h3><p>{examQuestionLabel(task, attempt.answers[change.answerIndex])}</p>
      <dl><dt>Before</dt><dd><q>{change.beforeQuote}</q></dd><dt>This time</dt><dd><q>{change.afterQuote}</q></dd></dl><p>{change.observation}</p></article>}
    {improvements.length > 0 && <><h3>Your practice focus</h3>{focusCard(improvements[0], 0)}
      {improvements.length > 1 && <details><summary>More coaching notes ({improvements.length - 1})</summary>{improvements.slice(1).map((item, i) => focusCard(item, i + 1))}</details>}</>}
  </section>;
}
