import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/api/http';
import { compareRepeat } from '../../shared/speakingTasks';

export function RepeatWords({ reference, transcript }) {
  const differences = compareRepeat(reference, transcript);
  return <section aria-label="Word and phrase review"><h4>Words & phrases</h4><p><strong>Target:</strong> {reference}</p><p><strong>Your transcript:</strong> {transcript}</p>
    {differences.omissions.length > 0 && <p>Replay the phrase containing <strong>{differences.omissions.join(', ')}</strong> — these words are missing from the transcript. Then repeat that phrase before trying the whole sentence.</p>}
    {differences.substitutions.map((item, index) => <p key={index}>The transcript has “{item.spoken}” where the sentence uses “{item.reference}”. Listen to that part, then try it once more.</p>)}
    {differences.additions.length > 0 && <p>The transcript adds “{differences.additions.join(', ')}”. Replay the sentence and try keeping its original wording.</p>}
    {differences.possibleReordered.length > 0 && <p>Check the order around “{differences.possibleReordered.join(', ')}”, then repeat the phrase as one unit.</p>}
    {!differences.missing.length && !differences.extra.length && <p>The words in your transcript match the sentence. Move on, or replay your recording and choose whether another take would help.</p>}
    <details><summary>What this comparison checks</summary><p>This compares text, not pronunciation. If the transcript missed a word you said, correct it before using the feedback.</p></details>
  </section>;
}

export default function AnswerFeedback({ attempt, repeat = false }) {
  const [result, setResult] = useState(null), [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function review() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setOpened(true); setBusy(true); setError('');
    try {
      const value = await apiJson('/api/speaking-feedback', { action: 'practice-answer', requestId: crypto.randomUUID(), attempt }, { signal: request.signal });
      if (!request.signal.aborted) setResult(value);
    } catch (issue) { if (!request.signal.aborted) setError(issue.message); }
    finally { if (!request.signal.aborted) setBusy(false); controller.current = null; }
  }
  return <section className="answer-feedback" aria-label="Single-answer feedback"><h3>{repeat ? 'This sentence · words & phrases' : 'This answer · one focus'}</h3>
    {!result && <button disabled={busy || !attempt.answers[0].text.trim()} onClick={review}>{busy ? 'Reading your answer…' : error ? 'Retry this feedback' : 'Review this answer'}</button>}
    {opened && repeat && <RepeatWords reference={attempt.answers[0].prompt} transcript={attempt.answers[0].text} />}
    {error && <p role="alert">{error}</p>}
    {result && <><p>{result.summary}</p>{result.improvements.slice(0, 1).map((item, index) => <div key={index}><blockquote>{item.quote}</blockquote><p>{item.reason}</p><p>{item.suggestion}</p><p><strong>Try this:</strong> {item.exercise}</p></div>)}</>}
  </section>;
}
