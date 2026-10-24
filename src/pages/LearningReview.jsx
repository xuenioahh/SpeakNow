import { VISUAL_METRICS } from '../../shared/visualEvidence';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiJson } from '@/api/http';
import { useAuth } from '@/lib/AuthContext';
import { learningStore, saveAttempt, cloudAttempt, deleteAttempt } from '@/lib/learningStore';
import LearningAudio from '@/components/LearningAudio';
import { getSpeakingTask, IELTS_CRITERIA, compareRepeat } from '../../shared/speakingTasks';
import '@/learning.css';
export default function LearningReview() {
  const location = useLocation(),
    navigate = useNavigate(),
    {
      user
    } = useAuth();
  const id = new URLSearchParams(location.search).get('id');
  const [attempt, setAttempt] = useState(null),
    [parent, setParent] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [compare, setCompare] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  const active = useRef(true),
    lock = useRef(false),
    request = useRef(null);
  useEffect(() => {
    active.current = true;
    setAttempt(null);
    setError('');
    setParent(null);
    setCompare(false);
    (async () => {
      let value = await learningStore.get('attempts', id);
      if (value?.ownerId && value.ownerId !== user?.id) value = null;
      if (!value && user) value = {
        ...(await apiJson('/api/speaking-practice', {
          action: 'get',
          id
        })),
        ownerId: user.id,
        cloudSaved: true
      };
      if (!value) throw new Error('Practice not found on this device. Sign in to retrieve cloud records.');
      if (!active.current) return;
      setAttempt(value);
      if (value.parentId) {
        let prior = await learningStore.get('attempts', value.parentId);
        if (prior?.ownerId && prior.ownerId !== user?.id) prior = null;
        if (!prior && user) prior = {
          ...(await apiJson('/api/speaking-practice', {
            action: 'get',
            id: value.parentId
          })),
          ownerId: user.id,
          cloudSaved: true
        };
        if (active.current) setParent(prior);
      }
    })().catch(e => active.current && setError(e.message));
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, [id, user?.id]);
  async function removePractice() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await deleteAttempt(attempt, user?.id); navigate('/practice/history'); }
    catch (e) { if (active.current) setError(e.message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function sync() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await cloudAttempt(attempt, user.id);
      if (active.current) {
        setAttempt(value);
        setStatus('Practice and available recordings synced to your account.');
      }
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function feedback() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setStatus('Reviewing your actual answers…');
    request.current = new AbortController();
    const timeout = setTimeout(() => request.current?.abort(), 35000);
    try {
      let value = attempt;
      if (user) {
        value = await cloudAttempt(value, user.id);
        if (active.current) setAttempt(value);
      }
      const result = await apiJson('/api/speaking-feedback', {
        attempt: value
      }, {
        signal: request.current.signal
      });
      value = {
        ...value,
        feedback: result,
        feedbackCloudSaved: Boolean(user)
      };
      await saveAttempt(value);
      if (active.current) {
        setAttempt(value);
        setStatus(user ? 'Feedback saved to your account and this device.' : 'Feedback saved on this device.');
      }
    } catch (e) {
      if (active.current) {
        setError(e.name === 'AbortError' ? 'Feedback timed out. Your answers are saved. Retry feedback.' : e.message);
        setStatus('Your answers remain available below.');
      }
    } finally {
      clearTimeout(timeout);
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  function retry(focus = '', answerIndex = null) {
    const params = new URLSearchParams({
      retry: attempt.id,
      focus
    });
    if (attempt.track === 'exam') {
      params.set('task', attempt.taskId);
      if (answerIndex === null && attempt.practiceMode === 'quick' && attempt.answers.length === 1) params.set('question', String(attempt.answers[0].questionIndex));
      if (answerIndex !== null) params.set('question', String(attempt.answers[answerIndex].questionIndex));
      navigate(`/exam/practice?${params}`);
    } else {
      params.set('scenario', attempt.context?.scenario || 'cafe');
      params.set('mode', attempt.context?.mode || 'basic');
      params.set('dialogMode', attempt.context?.dialogMode || 'goal_oriented');
      params.set('scoring', 'daily');
      navigate(`/voice/chat?${params}`);
    }
  }
  const responseList = value => value.answers.map((answer, index) => <article key={index} className="learning-answer"><p className="learning-muted">{answer.prompt}</p><blockquote>{answer.text || 'No transcript captured — recording available below.'}</blockquote>{Number.isFinite(answer.startSeconds) && <p className="learning-muted">Recording begins at {Math.floor(answer.startSeconds)}s from practice start{answer.durationSeconds > 0 ? ` · ${Math.round(answer.durationSeconds)}s recorded` : ''}. Camera evidence uses the same timeline.</p>}{(value.type === 'listen-repeat' || value.taskSnapshot?.steps?.[answer.questionIndex]?.type === 'listen-repeat') && (() => {
      const alignment = compareRepeat(answer.prompt, answer.text);
      return <div className="learning-muted"><p>Reference: {answer.prompt}</p><p>Transcript match: {alignment.matched} / {alignment.expected} reference words in order.</p>{alignment.missing.length > 0 && <p>Missing or changed: {alignment.missing.join(', ')}</p>}{alignment.extra.length > 0 && <p>Additional or changed words: {alignment.extra.join(', ')}</p>}{alignment.substitutions?.length > 0 && <p>Possible replacements: {alignment.substitutions.map(s => `${s.reference} → ${s.spoken}`).join('; ')}</p>}{alignment.possibleReordered?.length > 0 && <p>Possible word-order changes: {alignment.possibleReordered.join(', ')}</p>}<p>Recognition mistakes and repeated words can affect this alignment. It does not measure pronunciation.</p></div>;
    })()}{answer.recordingId && <LearningAudio attempt={value} recordingId={answer.recordingId} />}</article>);
  if (!attempt) return <main className="learning-page"><Link to="/practice/history">← Practice history</Link><p role="status">{error || 'Loading your practice…'}</p>{!user && <Link to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>}</main>;
  const report = attempt.feedback,
    task = attempt.taskSnapshot || getSpeakingTask(attempt.taskId);
  return <main className="learning-page"><header><Link to="/">← SpeakNow</Link><Link to="/practice/history">Practice history</Link></header><p className="learning-kicker">Practice review</p><h1>{attempt.title}</h1>
    <section><h2>1. What You Practiced</h2><p>{attempt.track === 'exam' ? `${attempt.exam.toUpperCase()} · ${attempt.type}` : attempt.context?.scenario} · {attempt.answers.length} answer{attempt.answers.length === 1 ? '' : 's'}{task ? ` of ${task.prompts.length}` : ''}</p>{attempt.focus && <p>Focus: {attempt.focus}</p>}
    <p className="learning-muted">{attempt.cloudSaved ? 'Saved to your account.' : 'Saved on this device.'} {!user && 'Sign in to keep a cloud copy; clearing browser data removes local recordings.'}</p></section>
    <section><h2>2. Your Performance</h2>{report ? <><p>{report.summary}</p>{report.strengths?.length > 0 && <ul>{report.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>}</> : <><p>No AI feedback yet. Your answers are saved and ready for review.</p><button className="primary" disabled={busy} onClick={feedback}>{busy ? 'Reviewing…' : 'Get AI feedback'}</button></>}
      {report && user && !attempt.feedbackCloudSaved && <button disabled={busy} onClick={feedback}>Generate feedback for cloud history</button>}
      <p className="learning-muted">Text-based coaching only. Pronunciation, intonation and actual pauses have not been assessed. No official exam score is assigned.</p>
      {attempt.exam === 'ielts' && <details><summary>IELTS assessment criteria</summary><p>{IELTS_CRITERIA.join(' · ')}. This review covers language and organisation visible in the transcript; acoustic fluency and pronunciation remain unassessed.</p></details>}
      {attempt.exam === 'toefl' && <details><summary>TOEFL 2026 assessment context</summary><p>{task?.criteria?.join(' · ')}. The official section uses a 1–6 scale in half-point increments. This transcript review does not calculate a section score or convert legacy 0–30 results.</p></details>}
      <details><summary>Speech evidence and limits</summary><p>Word counts and filler occurrences come from your transcript. Rate divides transcript words by recording duration, including silence; it is not articulation speed or an official fluency score.</p>{attempt.answers.map((answer,index) => <p key={index}>Answer {index+1}: {answer.text.split(/\s+/).filter(Boolean).length} words · transcript fillers (um, uh, erm): {(answer.text.match(/\b(?:um|uh|erm)\b/gi)||[]).length} · {answer.inputMode === 'voice' && answer.durationSeconds > 0 ? `${Math.round(answer.text.split(/\s+/).filter(Boolean).length*60/answer.durationSeconds)} words / recorded minute` : 'Speaking rate: Not assessed'}</p>)}<p>Actual pauses, clarity, pronunciation and intonation: Not assessed.</p></details>
      {attempt.track === 'daily' && <details><summary>Camera evidence</summary>
        <p className="learning-muted">On-device landmark estimates, relative to practice start. Values describe movement, not quality, confidence or eye contact. No raw video was recorded. These device-reported features are not an independent assessment.</p>
        {Object.entries(VISUAL_METRICS).map(([key,label]) => {
          const windows = attempt.visualEvidence?.windows?.filter(window => Number.isFinite(window.metrics?.[key])) || [];
          return <div key={key}><strong>{label}</strong>{windows.length ? <details><summary>{windows.length} observed segments</summary><ul>{windows.map((window,index) => <li key={index}>{Math.floor(window.start)}–{Math.ceil(window.end)}s · landmark variation {window.metrics[key]} · sampled coverage {Math.round(window.coverage*100)}%</li>)}</ul></details> : <p>Not assessed — insufficient visible landmarks.</p>}</div>;
        })}
        <details><summary>Framing and lighting observations</summary><p>Normalised eye midpoint / eye spacing and whole-frame brightness. These proxies do not measure camera distance, lighting quality or picture sharpness.</p>{['faceX','faceY','faceSize','luminance'].map(key => { const windows = attempt.visualEvidence?.windows?.filter(w => Number.isFinite(w.observations?.[key])) || [];return <p key={key}>{({faceX:'Horizontal eye midpoint',faceY:'Vertical eye midpoint',faceSize:'Eye spacing / frame width',luminance:'Mean frame brightness'})[key]}: {windows.length ? windows.map(w => `${Math.floor(w.start)}–${Math.ceil(w.end)}s: ${w.observations[key]}`).join('; ') : 'Not assessed'}</p>;})}</details>
        <p>Gesture meaning, facial emotion, picture sharpness, speech clarity, pronunciation and intonation: Not assessed.</p>
      </details>}
      <details><summary>Your answers and recordings</summary>{responseList(attempt)}</details></section>
    <section><h2>3. Key Improvements</h2>{report ? report.improvements.map((item, i) => <article className="learning-card" key={i}><p className="learning-kicker">Focus {i + 1} · Answer {item.answerIndex + 1}</p><details open={i === 0}><summary>{item.reason}</summary><blockquote>{item.quote}</blockquote><p><strong>Try:</strong> {item.suggestion}</p><p><strong>Practice:</strong> {item.exercise}</p><button disabled={busy} onClick={() => retry(item.exercise, item.answerIndex)}>Practise this focus</button></details></article>) : <p className="learning-muted">Request feedback to identify up to three specific improvements.</p>}</section>
    <section><h2>4. Practice Again</h2><div className="learning-actions"><button className={report ? "primary" : ""} disabled={busy} onClick={() => retry()}>Try the same task again</button>{parent && <button onClick={() => setCompare(value => !value)}>{compare ? 'Hide comparison' : 'Compare both attempts'}</button>}{user ? <button disabled={busy} onClick={sync}>Sync to my account</button> : <Link className="learning-button" to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in to sync</Link>}<Link className="learning-button" to={attempt.track === 'exam' ? '/exam' : '/voice'}>Choose next practice</Link></div>
    {compare && parent && <div className="learning-comparison"><div><h3>Previous attempt</h3>{responseList(parent)}</div><div><h3>This attempt</h3>{responseList(attempt)}</div><p className="learning-muted">Compare your wording and listen to both recordings. A longer answer alone does not prove improvement.</p></div>}</section>
    <details><summary>Manage saved practice</summary><p>Delete this attempt, its feedback, camera features and recordings from this device and its account copy. Linked retries must be deleted first. Copies on other devices are not removed.</p>{deleteConfirm ? <div className="learning-actions"><button disabled={busy} onClick={removePractice}>Confirm permanent deletion</button><button disabled={busy} onClick={() => setDeleteConfirm(false)}>Cancel</button></div> : <button disabled={busy} onClick={() => setDeleteConfirm(true)}>Delete practice</button>}</details>
    {status && <p role="status">{status}</p>}{error && <div role="alert" className="learning-alert"><p>{error}</p>{!report && <button disabled={busy} onClick={feedback}>Retry feedback</button>}</div>}
  </main>;
}
