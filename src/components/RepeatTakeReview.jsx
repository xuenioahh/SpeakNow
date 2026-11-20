import { examRubric } from '../../shared/examRubrics';
import ExamRubricGuide from './ExamRubricGuide';
import { useState } from 'react';
import { RepeatWords } from './AnswerFeedback';
import RecordingQuality from './RecordingQuality';

export default function RepeatTakeReview({ prompt, text, onEdit, recordingId, audioUrl, onAudioError, replaying, onListen, onRetry, canRecord }) {
  const [revealed, setRevealed] = useState(false);
  return <section className="repeat-take-review" aria-label="Sentence feedback">
    <h2>Check your wording</h2>
    <button aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? 'Hide comparison' : 'Compare with the reference'}</button>
    {revealed && <>
      <RepeatWords reference={prompt} transcript={text} />
      <dl className="repeat-lines"><div><dt>Reference</dt><dd>{prompt}</dd></div>
        <div><dt>Your transcript</dt><dd>{text || 'No transcript captured.'}</dd></div></dl>
      <ExamRubricGuide rubric={examRubric('toefl', 'listen-repeat')} />
    </>}
    <div className="repeat-replay-actions"><button disabled={replaying} onClick={onListen}>Listen again</button>
      <button disabled={!canRecord} onClick={onRetry}>Try again</button></div>
    <details className="repeat-take-tools"><summary>Recording &amp; transcript tools</summary>
      {audioUrl && <audio controls src={audioUrl} aria-label="Review recording" onError={onAudioError} />}
      <label>Edit transcript<textarea aria-label="Edit transcript" maxLength={8000} value={text} onChange={event => onEdit(event.target.value)} /></label>
      <RecordingQuality recordingId={recordingId} />
    </details>
  </section>;
}
