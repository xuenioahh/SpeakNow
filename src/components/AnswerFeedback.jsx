import { examRubric, transcriptCriterion } from '../../shared/examRubrics';
import ExamRubricGuide from './ExamRubricGuide';
import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/api/http';
import { compareRepeat } from '../../shared/speakingTasks';

export function RepeatWords({ reference, transcript }) {
  if (!transcript.trim()) return <p>Add your transcript to compare the wording.</p>;
  const diff = compareRepeat(reference, transcript);
  const notes = [
    ...diff.substitutions.map(({ spoken, reference: target }) => <>Use <strong>“{target}”</strong> in place of “{spoken}”.</>),
    ...diff.omissions.map(word => <>Include <strong>“{word}”</strong>.</>),
    ...diff.additions.map(word => <>Leave out <strong>“{word}”</strong>.</>),
    ...diff.possibleReordered.map(word => <>Check the position of <strong>“{word}”</strong>.</>),
  ];
  return <div className="repeat-word-focus">
    <p>{notes[0] || 'Your wording matches the sentence.'}</p>
    {notes.length > 1 && <details><summary>{notes.length - 1} more {notes.length === 2 ? 'difference' : 'differences'}</summary>
      <ul>{notes.slice(1).map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
  </div>;
}

export default function AnswerFeedback({ attempt, task }) {
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const rubric = examRubric(task?.exam, task?.steps?.[attempt.answers[0].questionIndex]?.type || task?.type);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function review() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try {
      const value = await apiJson('/api/speaking-feedback', { action: 'practice-answer', requestId: crypto.randomUUID(), attempt }, { signal: request.signal });
      if (!request.signal.aborted) setResult(value);
    } catch (issue) { if (!request.signal.aborted) setError(issue.message); }
    finally { if (!request.signal.aborted) setBusy(false); controller.current = null; }
  }
  return <section className="answer-feedback" aria-label="Single-answer feedback"><h3>This answer · one focus</h3>
    {!result && <button disabled={busy || !attempt.answers[0].text.trim()} onClick={review}>{busy ? 'Reading your answer…' : error ? 'Retry this feedback' : 'Review this answer'}</button>}
    {error && <p role="alert">{error}</p>}
    {result && <><p>{result.summary}</p>{result.improvements.slice(0, 1).map((item, index) => <div key={index}>{transcriptCriterion(rubric, item.criterion) && <strong className="criterion-label">{rubric.criteria[item.criterion]}</strong>}<blockquote>{item.quote}</blockquote><p>{item.reason}</p><p>{item.suggestion}</p>{item.exampleRewrite && <p><strong>One way to say it</strong> · <q>{item.exampleRewrite}</q></p>}<p><strong>Try this:</strong> {item.exercise}</p></div>)}</>}
    <ExamRubricGuide rubric={rubric} />
  </section>;
}
