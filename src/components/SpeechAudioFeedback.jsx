import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/api/http';
import { learningStore, recordingBlob, practicePayload, cloudAttempt } from '@/lib/learningStore';
import { useAuth } from '@/lib/AuthContext';
import { prepareSpeechAudio, audioBase64 } from '@/lib/speechAssessment';
import { AudioQualityDetails } from './RecordingQuality';

function PronunciationResult({ value, onReplay }) {
  if (value?.status !== 'assessed') return <p role="status">{value?.message || 'Pronunciation has not been assessed yet.'}</p>;
  return <div className="pronunciation-result">
    <dl className="audio-metrics">{[['accuracy', 'Pronunciation accuracy'], ['fluency', 'Acoustic fluency'], ['prosody', 'Stress & intonation']].map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>{value[key] === null ? 'Unavailable' : `${value[key]} / 100`}</dd></div>)}</dl>
    <p className="learning-muted">Azure Speech · {value.assessedSeconds.toFixed(1)} s of recognized speech in a {value.durationSeconds.toFixed(1)} s recording. Practice indicators, not an official exam score.</p>
    {value.issues.length > 0 && <div><h4>Words to review</h4><p>Replay these words before deciding whether to retry; recognition errors can affect the result.</p><ul>{value.issues.map((word, index) =>
      <li key={index}><button onClick={() => onReplay(word.start)} aria-label={`Replay ${word.word} at ${word.start.toFixed(1)} seconds`}>{word.word} · {word.accuracy} / 100 · {word.start.toFixed(1)} s</button></li>)}</ul></div>}
    <details><summary>Speech service transcript and scoring</summary><p>{value.recognizedText}</p><p>{value.aggregation}</p></details>
  </div>;
}

export default function SpeechAudioFeedback({ attempt, onResult }) {
  const { user } = useAuth();
  const [results, setResults] = useState(attempt.audioAssessments || {}), [errors, setErrors] = useState({}), [working, setWorking] = useState(''), [configuration, setConfiguration] = useState(null);
  const alive = useRef(true), lock = useRef(false), controllers = useRef(new Set()), currentAttempt = useRef(attempt), saveResult = useRef(onResult);
  currentAttempt.current = attempt; saveResult.current = onResult;
  const recordings = attempt.answers.map((answer, index) => ({ ...answer, answerIndex: index })).filter(answer => answer.recordingId);
  async function persist(recordingId, value) {
    if (!alive.current) return;
    setResults(previous => ({ ...previous, [recordingId]: value }));
    await saveResult.current(recordingId, value);
  }
  async function analyze(answer, assess = false) {
    const { recordingId, answerIndex } = answer;
    setWorking(recordingId); setErrors(previous => ({ ...previous, [recordingId]: '' }));
    try {
      const blob = await recordingBlob(currentAttempt.current, recordingId);
      const prepared = await prepareSpeechAudio(blob);
      if (!alive.current) return;
      const local = await learningStore.get('recordings', recordingId);
      if (local) await learningStore.put('recordings', { ...local, audioQuality: prepared.quality, audioQualitySize: blob.size });
      let result = { recordingId, quality: prepared.quality, pronunciation: currentAttempt.current.audioAssessments?.[recordingId]?.pronunciation || { status: 'not-configured', message: 'Pronunciation assessment is awaiting speech service setup. Recording quality checks are available.' } };
      await persist(recordingId, result);
      if (assess) {
        if (user && !currentAttempt.current.accountSaved && !currentAttempt.current.cloudSaved) await cloudAttempt(currentAttempt.current, user.id);
        const controller = new AbortController(); controllers.current.add(controller);
        const timer = setTimeout(() => controller.abort(), 105000);
        try {
          result = await apiJson('/api/speaking-audio', { attempt: practicePayload(currentAttempt.current), answerIndex, recordingId, data: audioBase64(prepared.wav) }, { signal: controller.signal, timeoutMs: 110000 });
        } finally { clearTimeout(timer); controllers.current.delete(controller); }
        await persist(recordingId, result);
      }
    } catch (error) {
      if (alive.current) setErrors(previous => ({ ...previous, [recordingId]: error.name === 'AbortError' ? 'Speech assessment timed out. Your recording is saved; retry below.' : error.message }));
    } finally { if (alive.current) setWorking(''); }
  }
  async function retry(answer) {
    if (lock.current) return;
    lock.current = true;
    try {
      const status = await apiJson('/api/speaking-audio', { action: 'status' });
      if (!alive.current) return;
      setConfiguration(status);
      await analyze(answer, status.configured);
    } catch (error) { if (alive.current) setErrors(previous => ({ ...previous, [answer.recordingId]: error.message })); }
    finally { lock.current = false; }
  }
  useEffect(() => {
    alive.current = true; lock.current = true;
    (async () => {
      let status = { configured: false };
      try { status = await apiJson('/api/speaking-audio', { action: 'status' }); }
      catch { status = { configured: false, unavailable: true }; }
      if (!alive.current) return;
      setConfiguration(status);
      for (const answer of recordings) {
        if (!alive.current) break;
        const previous = currentAttempt.current.audioAssessments?.[answer.recordingId];
        if (previous?.quality && (!status.configured || previous.pronunciation?.status === 'assessed')) continue;
        await analyze(answer, status.configured);
      }
    })().finally(() => { lock.current = false; });
    return () => { alive.current = false; for (const controller of controllers.current) controller.abort(); };
  }, [attempt.id]);
  function replay(answer, seconds) {
    const details = document.querySelector('#review-practiced details');
    details?.setAttribute('open', '');
    const element = document.getElementById(`answer-${attempt.id}-${answer.answerIndex}`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // The replay component keeps its audio mounted while collapsed.
    const audio = element?.querySelector('audio');
    if (audio) { audio.currentTime = Math.max(0, seconds - 0.3); void audio.play().catch(() => {}); }
  }
  const checked = Object.values(results).filter(result => result?.quality);
  const attention = checked.filter(result => result.quality.issues.length);
  return <details className="ielts-audio-feedback" aria-label={`${attempt.exam === 'daily' ? 'Daily conversation' : attempt.exam.toUpperCase()} speech and recording analysis`}><summary>Recording & pronunciation details{attention.length ? ` · ${attention.length} recordings to check` : ''}</summary><div className="speech-summary-row"><h2>Listen back</h2></div>
    {!recordings.length && <p>No recording is available. Record an answer to check your speech.</p>}
    <details className="speech-recording-details"><summary>View recording and speech details</summary>
    {configuration && !configuration.configured && <p className="learning-muted">Pronunciation scoring is unavailable; replay your recording to check the words yourself.</p>}
    {recordings.map(answer => {
      const result = results[answer.recordingId];
      return <article key={answer.recordingId} className="audio-answer" aria-busy={working === answer.recordingId}><h3>{attempt.track === 'daily' ? 'Reply' : 'Question'} {answer.answerIndex + 1}</h3>
        {result?.quality ? <AudioQualityDetails quality={result.quality} /> : <p role="status">{working === answer.recordingId ? 'Analyzing your recording…' : 'Waiting for recording checks…'}</p>}
        {result?.pronunciation?.status === 'assessed' && <><h4>Words to listen to again</h4><PronunciationResult value={result.pronunciation} onReplay={seconds => replay(answer, seconds)} /></>}
        {working === answer.recordingId && <p role="status">{configuration?.configured ? 'Assessing recorded speech…' : 'Checking recording quality…'}</p>}
        {errors[answer.recordingId] && <p role="alert">{errors[answer.recordingId]}</p>}
        {(configuration?.configured || errors[answer.recordingId]) && <button disabled={Boolean(working)} onClick={() => retry(answer)}>{errors[answer.recordingId] ? 'Retry audio assessment' : 'Recheck speech'}</button>}
      </article>;
    })}
    </details>
  </details>;
}
