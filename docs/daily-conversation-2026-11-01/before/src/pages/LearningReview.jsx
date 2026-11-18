import { VISUAL_METRICS } from '../../shared/visualEvidence';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiJson } from '@/api/http';
import { useAuth } from '@/lib/AuthContext';
import { learningStore, updateAttempt, practicePayload, saveAttempt, cloudAttempt, deleteAttempt } from '@/lib/learningStore';
import LearningAudio from '@/components/LearningAudio';
import LocalVideoClip from '@/components/LocalVideoClip';
import SpeechAudioFeedback from '@/components/SpeechAudioFeedback';
import { getSpeakingTask, compareRepeat, registerTaskSnapshot } from '../../shared/speakingTasks';
import { examPath, questionBankPath, getBankTask } from '../../shared/questionBank';
import { Root as AlertDialog, Trigger as AlertDialogTrigger, Portal as AlertDialogPortal, Overlay as AlertDialogOverlay, Content as AlertDialogContent, Title as AlertDialogTitle, Description as AlertDialogDescription, Cancel as AlertDialogCancel } from '@radix-ui/react-alert-dialog';
import '@/learning.css';

/** @type {[string, [string, string][]][]} */
const DAILY_PERFORMANCE = [
  ['Speech', [['pace', 'Speaking pace'], ['pauses', 'Pauses'], ['fluency', 'Speaking time'], ['fillers', 'Filler words']]],
  ['Camera', [['headOrientation', 'Head direction'], ['handMovement', 'Hand movement'], ['posture', 'Shoulder position'], ['cameraEngagement', 'Camera direction'], ['framing', 'Framing']]],
  ['Communication', [['relevance', 'Response to the task'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary']]],
];

/** @param {Record<string, {value?: string}>} metrics @returns {[string, [string, string][]][]} */
function dailyPerformanceGroups(metrics) {
  /** @type {[string, [string, string][]][]} */
  const groups = [];
  for (const [category, entries] of DAILY_PERFORMANCE) {
    const present = entries.filter(([key]) => {
      const value = metrics[key]?.value;
      return typeof value === 'string' && value.trim() && !(key === 'fillers' && /^0\b/.test(value));
    });
    if (present.length) groups.push([category, present]);
  }
  return groups;
}

function reviewImprovements(value) {
  const seen = new Set();
  return (value.feedback?.improvements || []).filter(item => {
    if (!Number.isInteger(item.answerIndex) ||
      !['quote', 'reason', 'suggestion', 'exercise'].every(key => typeof item[key] === 'string' && item[key].trim()) ||
      !value.answers[item.answerIndex]?.text?.includes(item.quote)) return false;
    const key = JSON.stringify([item.answerIndex, item.quote, item.suggestion, item.exercise]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

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
    [operation, setOperation] = useState(''),
    [syncFailed, setSyncFailed] = useState(false),
    [compare, setCompare] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  const active = useRef(true),
    lock = useRef(false),
    request = useRef(null),
    autoRequested = useRef(false);
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    setAttempt(null);
    setError('');
    setParent(null);
    setCompare(false);
    setStatus(''); setOperation(''); setSyncFailed(false); setDeleteConfirm(false);
    (async () => {
      let value = await learningStore.get('attempts', id);
      if (value?.ownerId && value.ownerId !== user?.id) value = null;
      if (!value && user) {
        const remote = await apiJson('/api/speaking-practice', { action: 'get', id });
        value = { ...remote, ownerId: user.id, cloudSaved: true, feedbackCloudSaved: Boolean(remote.feedback) };
      }
      if (!value) throw new Error('Practice not found on this device. Sign in to retrieve cloud records.');
      if (cancelled) return;
      if (value.taskSnapshot) registerTaskSnapshot(value.taskSnapshot);
      setAttempt(value);
      if (value.feedbackRequest?.status === 'failed' && !value.feedback) { setOperation('feedback'); setError(value.feedbackRequest.message); }
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
        if (!cancelled) setParent(prior);
      }
    })().catch(e => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      active.current = false;
      request.current?.abort();
    };
  }, [id, user?.id]);
  async function removePractice() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setOperation('delete');
    try { await deleteAttempt(attempt, user?.id); navigate('/practice/history'); }
    catch (e) { if (active.current) setError(e.message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function removeVideoClip() {
    if (!attempt?.videoClip) return;
    const clipId = attempt.videoClip.id;
    try {
      const updated = await saveAttempt({ ...attempt, videoClip: null });
      await learningStore.remove('recordings', clipId);
      setAttempt(updated);
    } catch (e) { setError(e.message); }
  }
  async function sync() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    setOperation('sync');
    try {
      const value = await cloudAttempt(attempt, user.id);
      if (active.current) {
        setAttempt(value);
        setSyncFailed(false);
      }
    } catch (e) {
      const saved = await learningStore.get('attempts', attempt.id).catch(() => null);
      if (active.current) { if (saved) setAttempt(saved); setError(e.message); setSyncFailed(true); }
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
    setOperation('feedback');
    setStatus('');
    request.current = new AbortController();
    const timeout = setTimeout(() => request.current?.abort(), 60000);
    try {
      let value = attempt;
      await updateAttempt(value.id, latest => ({ ...latest, feedbackRequest: { status: 'processing', startedAt: new Date().toISOString() } }));
      if (user) {
        try { value = await cloudAttempt(value, user.id); if (active.current) setSyncFailed(false); }
        catch (e) {
          const saved = await learningStore.get('attempts', attempt.id).catch(() => null);
          if (active.current) { if (saved) setAttempt(saved); setSyncFailed(true); }
          throw e;
        }
        if (active.current) setAttempt(value);
      }
      const result = await apiJson('/api/speaking-feedback', {
        attempt: practicePayload(value.track === 'daily' ? { ...value, visualEvidence: null, videoClip: null, liveMetrics: null, visionTimeline:null,voiceTimings:null } : value)
      }, {
        signal: request.current.signal
      });
      value = await updateAttempt(value.id, latest => ({ ...latest, feedback: result, feedbackCloudSaved: Boolean(user), feedbackRequest: { status: 'ready' } }));
      if (active.current) {
        setAttempt(value);
        setStatus('Feedback ready.');
      }
    } catch (e) {
      const message = e.name === 'AbortError' ? 'Feedback request stopped. Your answers are saved. Retry feedback when ready.' : e.message;
      await updateAttempt(attempt.id, latest => ({ ...latest, feedbackRequest: { status: 'failed', message, code: e.code || 'feedback_interrupted', failedAt: new Date().toISOString() } })).catch(() => {});
      if (active.current) {
        setError(message);
        setStatus('');
      }
    } finally {
      clearTimeout(timeout);
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function saveAudioAssessment(recordingId, result) {
    await updateAttempt(id, latest => ({ ...latest, audioAssessments: { ...latest.audioAssessments, [recordingId]: result } }));
    if (active.current) setAttempt(previous => previous && { ...previous, audioAssessments: { ...previous.audioAssessments, [recordingId]: result } });
  }
  useEffect(() => {
    if (!attempt || attempt.feedback || attempt.feedbackRequest?.status === 'failed' || autoRequested.current || new URLSearchParams(location.search).get('generate') !== '1') return;
    autoRequested.current = true;
    if (attempt.answers.some(answer => answer.text?.trim())) void feedback();
  }, [attempt?.id, location.search]);
  function retry(focus = '', answerIndex = null, wholeSet = false, retryPart = null) {
    const params = new URLSearchParams({
      retry: attempt.id,
      focus
    });
    if (attempt.track === 'exam') {
      const task = attempt.taskSnapshot || getSpeakingTask(attempt.taskId);
      const questionIndex = wholeSet || retryPart ? null : answerIndex !== null ? attempt.answers[answerIndex].questionIndex : attempt.practiceMode === 'quick' && attempt.answers.length === 1 ? attempt.answers[0].questionIndex : null;
      navigate(examPath(task, { questionIndex, parentId: attempt.id, focus, sessionMode: 'practice', part: retryPart || (answerIndex === null && !wholeSet ? attempt.part : null) }));
    } else {
      if(answerIndex!==null && attempt.answers[answerIndex])params.set('retryPrompt',attempt.answers[answerIndex].prompt);
      params.set('scenario', attempt.context?.scenario || 'cafe');
      if (attempt.context?.cue) params.set('cue', attempt.context.cue);
      params.set('mode', attempt.context?.mode || 'basic');
      params.set('dialogMode', attempt.context?.dialogMode || 'goal_oriented');
      params.set('scoring', 'daily');
      navigate(`/voice/chat?${params}`);
    }
  }
  const responseList = value => value.answers.map((answer, index) => {
    const repeat = value.type === 'listen-repeat' || value.taskSnapshot?.steps?.[answer.questionIndex]?.type === 'listen-repeat';
    const alignment = repeat && answer.prompt?.trim() && answer.text?.trim() ? compareRepeat(answer.prompt, answer.text) : null;
    const issues = reviewImprovements(value).filter(item => item.answerIndex === index);
    const reference = value.taskSnapshot?.questions?.[answer.questionIndex]?.referenceAnswer;
    return <article key={`${value.id}-${index}`} className="learning-answer" id={`answer-${value.id}-${index}`}>
      <h3>{repeat ? 'Sentence' : value.track === 'daily' ? 'Turn' : 'Question'} {answer.questionIndex + 1}</h3>
      <p>{answer.prompt}</p>
      {value.taskSnapshot?.questions?.[answer.questionIndex]?.cuePoints?.length > 0 && <ul>{value.taskSnapshot.questions[answer.questionIndex].cuePoints.map(point => <li key={point}>{point}</li>)}</ul>}
      {answer.text?.trim() ? <><p className="learning-muted review-answer-label">Your answer</p><blockquote>{answer.text}</blockquote></> : <p role="status">No transcript available.</p>}
      {answer.recordingId ? <LearningAudio attempt={value} recordingId={answer.recordingId} label={`Recording for ${value.id === id ? 'this' : 'previous'} attempt, answer ${index + 1}`} /> : answer.inputMode === 'voice' && <p className="learning-muted">No recording saved.</p>}
      {alignment && <div className="review-differences" role="group" aria-label={`Text differences for sentence ${answer.questionIndex + 1}`}>
        {alignment.missing.length || alignment.extra.length ? <>
          <h4>Text differences</h4>
          {alignment.omissions.length > 0 && <p><strong>Missing:</strong> {alignment.omissions.join(', ')}</p>}
          {alignment.additions.length > 0 && <p><strong>Added:</strong> {alignment.additions.join(', ')}</p>}
          {alignment.substitutions.length > 0 && <p><strong>Possible replacements:</strong> {alignment.substitutions.map(s => `${s.reference} → ${s.spoken}`).join('; ')}</p>}
          {alignment.possibleReordered.length > 0 && <p><strong>Possible word-order changes:</strong> {alignment.possibleReordered.join(', ')}</p>}
        </> : <p>The transcript matches the sentence.</p>}
      </div>}
      {issues.length > 0 && value.id === id && <a className="review-issue-link" href={`#improvement-${issues[0].answerIndex}`}>View feedback for this answer</a>}
      {answer.rawTranscript !== null && answer.rawTranscript !== undefined && answer.rawTranscript.trim() !== answer.text?.trim() && <details><summary>Original transcript</summary><p>{answer.rawTranscript || 'No transcript captured.'}</p></details>}
      {reference && (answer.text?.trim() || answer.recordingId) && <details><summary>Reference answer (practice example)</summary><p>{reference}</p>{value.taskSnapshot?.questions?.[answer.questionIndex]?.referenceAlternatives?.map((text, index) => <p key={index}>{text}</p>)}</details>}
      {value.id === id && value.track === 'exam' && value.answers.length > 1 && <button className="review-retry-answer" disabled={busy} onClick={() => retry('', index)}>Retry {repeat ? 'sentence' : 'question'} {answer.questionIndex + 1}</button>}
      {value.id === id && value.track === 'daily' && <button disabled={busy} onClick={()=>retry('Improve this reply',index)}>Improve this reply</button>}
    </article>;
  });
  if (!attempt) return <main className="learning-page"><Link to="/progress">← Practice history</Link><p role="status">{error || 'Loading your practice…'}</p>{error && !user && <Link to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>}</main>;
  const report = attempt.feedback,
    task = attempt.taskSnapshot || getSpeakingTask(attempt.taskId);
  const hasTranscript = attempt.answers.some(answer => answer.text?.trim());
  const hasRepeatDifferences = attempt.answers.some(answer => {
    if (!(attempt.type === 'listen-repeat' || task?.steps?.[answer.questionIndex]?.type === 'listen-repeat') || !answer.prompt?.trim() || !answer.text?.trim()) return false;
    const alignment = compareRepeat(answer.prompt, answer.text);
    return alignment.missing.length > 0 || alignment.extra.length > 0;
  });
  const improvements = reviewImprovements(attempt);
  const total = attempt.practiceMode === 'quick' ? 1 : task?.prompts?.length;
  const answered = attempt.answers.filter(answer => answer.text?.trim() || answer.recordingId).length;
  const syncLabel = syncFailed ? 'Sync failed' : attempt.cloudSaved ? (report && !attempt.feedbackCloudSaved ? 'Answers synced · feedback saved locally' : 'Synced to your account') : 'Saved locally';
  const windows = attempt.visualEvidence?.windows || [];
  const liveMetrics = attempt.track === 'daily' ? attempt.liveMetrics?.metrics || {} : {};
  const performanceGroups = dailyPerformanceGroups(liveMetrics);
  const hasLiveMetrics = performanceGroups.length > 0;
  const daily = attempt.track === 'daily';
  const camera = daily ? attempt.visionTimeline : null;
  const visualEvents = (camera?.events || []).filter(event => event.speaker === 'user' && attempt.answers.some(answer=>answer.turnId===event.turnId));
  const cameraIssue=visualEvents.find(event=>event.end-event.start>=2.5&&['frame-edge','low-light','face-missing'].includes(event.kind));
  const cameraAdvice=cameraIssue?({'frame-edge':'Adjust your seat or camera so your face remains comfortably within the frame.','low-light':'Try facing a light source, then check the camera preview before your next reply.','face-missing':'Check the preview for framing, obstructions or lighting. Missing landmarks can also reflect detector limitations.'})[cameraIssue.kind]:'';
  const pauseEvents = daily ? (attempt.liveMetrics?.timeline || []).filter(event=>event.kind==='pause' && event.duration>=1 && attempt.answers.some(answer=>answer.turnId===event.turnId)) : [];
  const keyMoments = [...visualEvents,...pauseEvents.map(event=>({...event,label:`Pause of ${event.duration.toFixed(1)} seconds`,source:'microphone voice activity'}))].sort((a,b)=>a.start-b.start);
  const clock = seconds => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
  return <main className="learning-page review-page"><header><Link to="/">← SpeakNow</Link><Link to="/progress">My Progress</Link></header>
    <div className="review-intro"><p className="learning-kicker">{daily ? 'Daily Conversation' : 'Exam Practice'} · Feedback</p><h1>{attempt.title}</h1>
    <p className="learning-muted">{attempt.track === 'exam' && !attempt.title.toLowerCase().includes(attempt.exam) ? `${attempt.exam.toUpperCase()} · ` : ''}{total ? `${answered} of ${total} answered` : `${answered} ${answered === 1 ? 'reply' : 'replies'}`}</p>
    {report?.summary && <p className="review-summary">{report.summary}</p>}</div>
    <div className="review-save"><span role="status">{busy && operation === 'sync' ? 'Syncing…' : syncLabel}</span>
      {user ? (!attempt.cloudSaved || syncFailed) && <button disabled={busy} onClick={sync}>{syncFailed ? 'Retry sync' : 'Sync to my account'}</button> : <Link to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in to sync</Link>}
      <details><summary>Save details</summary><p>Clearing browser data removes local copies. Synced copies remain in your account.</p>{report && user && attempt.cloudSaved && !attempt.feedbackCloudSaved && <button disabled={busy} onClick={feedback}>Generate account feedback</button>}</details>
    </div>
    {operation === 'sync' && error && <p role="alert">{error}</p>}
    <nav className="review-section-nav" aria-label="Feedback sections"><a href="#review-performance">Overall</a><a href="#review-improvements">Improvements</a><a href="#review-again">Practice again</a></nav>
    <section id="review-performance" className="review-feedback" aria-label="AI feedback" aria-busy={busy && operation === 'feedback'}>
      <h2>Overall Performance</h2>
      {attempt.exam === 'ielts' && <div className="ielts-dimension-overview">{[['coherence', 'Coherence'], ['lexical', 'Lexical Resource'], ['grammar', 'Grammar'], ['pronunciation', 'Pronunciation']].map(([key, label]) => <div key={key}><strong>{label}</strong>{report?.dimensions?.[key] ? <details><summary>View transcript evidence</summary><p>{report.dimensions[key].observation}</p><blockquote>{report.dimensions[key].quote}</blockquote><p>{report.dimensions[key].suggestion}</p></details> : <span>{key === 'pronunciation' ? <a href="#review-audio">View speech analysis below</a> : 'No verified dimension evidence yet'}</span>}</div>)}</div>}
      {report?.parts?.length > 0 && <details className="part-feedback"><summary>Performance by Part</summary>{report.parts.map(part => <article key={part.part}><h3>Part {part.part}</h3><p>{part.summary}</p><blockquote>{part.quote}</blockquote></article>)}</details>}
      {report ? <>{report.strengths?.length > 0 && <><h3>What worked</h3><ul>{report.strengths.slice(0, 2).map((s, i) => <li key={i}>{s}</li>)}</ul></>}</> : hasTranscript ? <>
        <p className="learning-muted">Your answers are saved. Request feedback to review the language in your actual responses.</p>
        <button className="primary" disabled={busy} onClick={feedback}>{busy && operation === 'feedback' ? 'Reviewing…' : operation === 'feedback' && error ? 'Retry feedback' : 'Get AI feedback'}</button>
        {busy && operation === 'feedback' && <button onClick={() => request.current?.abort()}>Cancel feedback · keep answers</button>}
      </> : <p className="learning-muted">No transcript or assessed speaking evidence is available for this attempt.</p>}
      <p role="status" className="review-status sr-only" aria-live="polite">{busy && operation === 'feedback' ? <span className="sr-only">Generating feedback</span> : operation === 'feedback' ? status : ''}</p>
      {operation === 'feedback' && error && <p role="alert">{error}</p>}
      {daily && Object.keys(liveMetrics).length > 0 && <details className="review-observation-details"><summary>Speech and communication details</summary>
      {attempt.track === 'daily' && hasLiveMetrics && <div className="review-live-metrics">{performanceGroups.map(([category, entries]) => <section key={category}><h3>{category}</h3>{entries.map(([key, label]) => <div key={key} className={category === 'Communication' ? 'is-commentary' : ''}><strong>{label}</strong><span>{liveMetrics[key].value}</span></div>)}</section>)}</div>}
      {attempt.track === 'daily' && Object.keys(liveMetrics).length > 0 && <details className="review-measurement-details"><summary>How these observations were measured</summary><p>Speech observations use recorded microphone activity. Language comments use the transcript. Camera observations appear only when valid landmarks were captured. These are practice observations, not an exam score.</p><dl>{Object.entries(liveMetrics).filter(([, metric]) => metric?.value).map(([key, metric]) => <div key={key}><dt>{DAILY_PERFORMANCE.flatMap(([, entries]) => entries).find(([name]) => name === key)?.[1] || key}</dt><dd>{metric.source} · {metric.samples} samples · {metric.reliability}</dd></div>)}</dl></details>}
      </details>}
      {attempt.track === 'daily' && attempt.videoClip && <div className="review-evidence" id="video-moment" aria-label="Multimodal evidence"><h3>On-Camera Delivery</h3>
        {attempt.videoClip ? <article><h4>Moment · {Math.floor(attempt.videoClip.start / 60).toString().padStart(2,'0')}:{Math.floor(attempt.videoClip.start % 60).toString().padStart(2,'0')}–{Math.floor(attempt.videoClip.end / 60).toString().padStart(2,'0')}:{Math.floor(attempt.videoClip.end % 60).toString().padStart(2,'0')}</h4><LocalVideoClip id={attempt.videoClip.id} />{attempt.videoClip.transcriptSegment && <p><strong>Reply:</strong> {attempt.videoClip.transcriptSegment}</p>}<p><strong>What happened:</strong> {attempt.videoClip.observation}</p><p><strong>Why it matters:</strong> {attempt.videoClip.why}</p><p><strong>Try this:</strong> {attempt.videoClip.tryThis}</p><p className="learning-muted">This is a local video moment selected from device measurements, not an AI video score.</p><button type="button" onClick={removeVideoClip}>Delete saved video moment</button></article> : <p>Not assessed — no reliable recorded moment was saved for this practice.</p>}
      </div>}
    </section>
    <section id="review-improvements"><h2>Improvements</h2>{attempt.videoClip && <article className="review-improvement"><h3>Review your camera framing or movement</h3><a href="#video-moment">Watch the recorded moment</a><p>{attempt.videoClip.observation}</p><p>{attempt.videoClip.why}</p><p><strong>Try:</strong> {attempt.videoClip.tryThis}</p><button disabled={busy} onClick={() => retry(attempt.videoClip.tryThis)}>Practise this focus</button></article>}{cameraIssue&&!attempt.videoClip&&<article className="review-improvement"><h3>{cameraIssue.label}</h3><p>{clock(cameraIssue.start)}–{clock(cameraIssue.end)}</p><p>{cameraAdvice}</p><button disabled={busy} onClick={()=>retry(cameraAdvice,attempt.answers.findIndex(answer=>answer.turnId===cameraIssue.turnId))}>Practise this focus</button></article>}{improvements.length ? improvements.slice(0,(attempt.videoClip||cameraIssue) ? 2 : 3).map((item, i) => <article className="review-improvement" key={i} id={improvements.findIndex(other => other.answerIndex === item.answerIndex) === i ? `improvement-${item.answerIndex}` : undefined}>
      <a href={`#answer-${attempt.id}-${item.answerIndex}`} onClick={() => document.querySelector('#review-practiced details')?.setAttribute('open', '')}>Answer {item.answerIndex + 1}</a><h3>{item.reason}</h3><blockquote>{item.quote}</blockquote><p>{item.suggestion}</p><p><strong>Try:</strong> {item.exercise}</p>
      <button disabled={busy} onClick={() => retry(item.exercise, item.answerIndex)}>Practise this focus</button>
    </article>) : !attempt.videoClip && !cameraIssue && <p>{report ? report.improvements?.length ? 'No verifiable suggestions in this feedback.' : 'No specific corrections suggested.' : 'Generate feedback to see evidence-linked improvements.'}</p>}</section>
    <section id="review-again"><h2>Practice Again</h2><div className="learning-actions"><button className="primary" disabled={busy} onClick={() => retry()}>{attempt.track === 'daily' ? 'Retry this conversation' : 'Try the same task again'}</button>{task?.setId && attempt.practiceMode === 'quick' && task.prompts.length > 1 && <button disabled={busy} onClick={() => retry('', null, true)}>Practise the whole set</button>}{task?.isFullMock && [1,2,3].map(part => <button key={part} disabled={busy} onClick={() => retry('', null, false, part)}>Retry Part {part}</button>)}<Link className="learning-button" to={task?.bankTaskType ? questionBankPath(task.bankTaskType) : attempt.track === 'exam' ? '/exam' : `/voice/prepare?${new URLSearchParams({scenario:attempt.context?.scenario || 'cafe',mode:attempt.context?.mode || 'basic'})}`}>{task?.bankTaskType ? 'Back to Bank' : attempt.track === 'exam' ? 'Choose next practice' : 'Choose another conversation'}</Link>
      {parent && <button aria-expanded={compare} aria-controls="attempt-comparison" onClick={() => setCompare(value => !value)}>{compare ? 'Hide comparison' : 'Compare both attempts'}</button>}</div>
      {compare && parent && <div id="attempt-comparison" className="learning-comparison"><div><h3>Previous attempt</h3>{responseList(parent)}</div><div><h3>This attempt</h3>{attempt.answers.map((answer,i) => <p key={i}><a href={`#answer-${attempt.id}-${i}`} onClick={() => document.querySelector('#review-practiced details')?.setAttribute('open', '')}>View answer {i + 1} and recording above</a></p>)}</div></div>}
    </section>
    <section id="review-practiced" aria-label="What You Practiced"><h2 className="sr-only">What You Practiced</h2>{attempt.focus && <p>Focus: {attempt.focus}</p>}
      {<details><summary>{daily ? 'Conversation transcript and recordings' : 'Questions, transcripts and recordings'}</summary>{attempt.turns?.length>0&&<div className="review-dialogue-transcript">{attempt.turns.map((turn,index)=><p key={index}><strong>{turn.role==='user'?'You':'Partner'}:</strong> {turn.content}</p>)}</div>}{responseList(attempt)}</details>}
      {hasRepeatDifferences && <p className="learning-muted">Text differences may include transcription errors.</p>}
    </section>
    {daily && (camera?.frames > 0 || keyMoments.length > 0) && <details className="review-observation-details"><summary>Recorded observations and timeline</summary>
      {camera?.frames > 0 && <section aria-label="Camera Analysis"><h3>Camera analysis</h3><p>{camera.validSamples?.face > 0 ? 'Camera landmarks were analyzed in captured intervals.' : 'No reliable face landmarks were available in this recording.'}</p>{visualEvents.length > 0 && <p>{visualEvents.length} sustained visual observations are linked to your replies.</p>}</section>}
      {keyMoments.length > 0 && <section><h3>Key moments</h3>{keyMoments.map((event,index)=>{const answerIndex=attempt.answers.findIndex(answer=>answer.turnId===event.turnId);return <article className="review-observation" key={index}><strong>{clock(event.start)}–{clock(event.end)} · {event.label}</strong><p>{attempt.answers[answerIndex]?.text}</p>{answerIndex >= 0 && <a href={`#answer-${attempt.id}-${answerIndex}`} onClick={()=>{const details=document.querySelector('.review-page section[aria-label="What You Practiced"] details');if(details)details.setAttribute('open','');}}>Reply {answerIndex+1} and recording</a>}<small className="learning-muted"> · {event.source}</small></article>;})}</section>}
    </details>}
    {attempt.answers.some(answer => answer.recordingId) && <div id="review-audio"><SpeechAudioFeedback key={attempt.id} attempt={attempt} onResult={saveAudioAssessment} /></div>}
    {!operation && error && <p role="alert">{error}</p>}
    {task?.relatedSetId && <p><Link className="learning-button" to={examPath(getBankTask(task.relatedSetId))}>Practise related {task.type === 'part2' ? 'Part 3 discussion' : 'Part 2 cue card'} →</Link></p>}
    {attempt.track === 'daily' && windows.some(w => Object.values(w.metrics || {}).some(Number.isFinite) || Object.values(w.observations || {}).some(Number.isFinite)) && <details><summary>Camera details</summary><p>On-device movement estimates; these do not assess confidence, eye contact, or speaking quality.</p>
      {Object.entries(VISUAL_METRICS).map(([key,label]) => {const observed = windows.filter(w => Number.isFinite(w.metrics?.[key])); return observed.length > 0 && <details key={key}><summary>{label}</summary>{observed.map((w,i) => <p key={i}>{Math.floor(w.start)}–{Math.ceil(w.end)}s · variation {w.metrics[key]} · coverage {Math.round(w.coverage*100)}%</p>)}</details>;})}
      {windows.some(w => Object.values(w.observations || {}).some(Number.isFinite)) && <details><summary>Framing and brightness</summary><p>Eye position, eye spacing and brightness estimates; not camera distance or image quality.</p>{['faceX','faceY','faceSize','luminance'].map(key => {const observed = windows.filter(w => Number.isFinite(w.observations?.[key]));return observed.length > 0 && <p key={key}>{({faceX:'Horizontal eye position',faceY:'Vertical eye position',faceSize:'Eye spacing / frame width',luminance:'Mean frame brightness'})[key]}: {observed.map(w => `${Math.floor(w.start)}–${Math.ceil(w.end)}s: ${w.observations[key]}`).join('; ')}</p>;})}</details>}
    </details>}
    <footer className="review-footer"><AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
      <AlertDialogTrigger asChild><button className="review-delete" disabled={busy}>Delete practice</button></AlertDialogTrigger>
      <AlertDialogPortal><AlertDialogOverlay className="review-dialog-overlay" /><AlertDialogContent className="review-dialog"><AlertDialogTitle>Delete this practice?</AlertDialogTitle><AlertDialogDescription>
        This permanently deletes this attempt, its feedback, saved camera measurements and unshared recordings from this device{attempt.ownerId ? ' and your account' : ''}. Linked retries must be deleted first. Copies on other devices remain.
      </AlertDialogDescription>{operation === 'delete' && error && <p role="alert">{error}</p>}<div className="learning-actions"><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><button className="review-confirm-delete" disabled={busy} onClick={removePractice}>{busy ? 'Deleting…' : 'Confirm permanent deletion'}</button></div></AlertDialogContent></AlertDialogPortal>
    </AlertDialog></footer>
  </main>;
}
