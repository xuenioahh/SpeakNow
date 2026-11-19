import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { examSelection, examDraftKey } from '@/lib/examSelection';
import { examPath, questionBankPath } from '../../shared/questionBank';
import { VoiceCapture } from '@/lib/voice/VoiceCapture';
import { AudioTake } from '@/lib/voice/AudioTake';
import { prepareRecordedTranscription } from '@/lib/dailyTranscription';
import { audioManager } from '@/lib/audioManager';
import { learningStore, saveAttempt, discardPracticeDraft } from '@/lib/learningStore';
import AnswerFeedback from '@/components/AnswerFeedback';
import { apiJson } from '@/api/http';
import { useAuth } from '@/lib/AuthContext';
import RecordingQuality from '@/components/RecordingQuality';
import { cacheRecordingQuality } from '@/lib/speechAssessment';
import '@/learning.css';

const working = ['permission', 'playing', 'recording', 'processing', 'saving'];
function fixedPromptAudioId(task, index) {
  if (task.questions?.[index]?.questionId) return `question-${task.questions[index].questionId}`;
  if (task.type === 'mock') return index < 7 ? `legacy-toefl-repeat-campus-v1-${index}` : `legacy-toefl-interview-campus-v1-${index - 7}`;
  return `legacy-${task.id}-${index}`;
}
export default function ExamPractice() {
  const location = useLocation(), navigate = useNavigate(), { user } = useAuth();
  const params = new URLSearchParams(location.search), selection = examSelection(params), task = selection?.task;
  const sessionMode = params.get('sessionMode') === 'exam' ? 'exam' : 'practice';
  const requested = selection?.questionIndex === null || selection?.questionIndex === undefined ? null : String(selection.questionIndex);
  const parentId = params.get('retry') || null, focus = params.get('focus') || '';
  const single = requested !== null && /^\d+$/.test(requested) && task?.prompts[Number(requested)] !== undefined;
  const part = selection?.part || null;
  const indices = single ? [Number(requested)] : (task?.prompts.map((_, i) => i) || []).filter(index => !part || task.steps?.[index]?.part === part);
  const session = params.get('session');
  const draftKey = examDraftKey(user?.id, task?.id, parentId, focus, requested === null ? null : Number(requested), part, sessionMode);
  const [draft, setDraft] = useState(null), [phase, setPhase] = useState('loading'), [error, setError] = useState('');
  const [text, setText] = useState(''), [audioUrl, setAudioUrl] = useState(''), [remaining, setRemaining] = useState(0), [heard, setHeard] = useState(false);
  const alive = useRef(true), current = useRef(null), capture = useRef(null), take = useRef(null), lock = useRef(false);
  const discarding = useRef(false);
  const writes = useRef(Promise.resolve()), writeError = useRef(null), deadline = useRef(0), started = useRef(0), finishRef = useRef(null), playRef = useRef(null);
  const stopJob = useRef(null), recordingGeneration = useRef(0), auto = useRef(false), preparing = useRef(false), autoStartTriggered = useRef(false);
  const index = draft?.answers.length || 0, questionIndex = indices[index], prompt = task?.prompts[questionIndex];
  const step = task?.steps?.[questionIndex], stepType = step?.type || task?.type;
  const answerSeconds = step?.answerSeconds || task?.timing.answerSeconds;
  const preparationSeconds = step?.preparationSeconds ?? task?.timing.preparationSeconds;
  const isMock = task?.type === 'mock' || task?.type === 'ielts-mock', ieltsMock = task?.type === 'ielts-mock', busy = working.includes(phase);
  function persist(value) {
    if (discarding.current) return Promise.resolve();
    current.current = value;
    if (alive.current) { setDraft(value); setText(value.text || ''); }
    const job = writes.current.catch(() => {}).then(() => learningStore.put('drafts', { ...value, id: draftKey, attemptId: value.id }));
    writes.current = job;
    job.then(() => { writeError.current = null; }, e => { writeError.current = e; if (alive.current) setError(e.message); });
    return job;
  }
  function update(fields) { return persist({ ...current.current, ...fields }); }
  async function finishPreparation() {
    preparing.current = false; deadline.current = 0; setPhase('saving');
    try { await update({ prepared: true }); }
    catch (error) { if (alive.current) setError(error.message); return; }
    finally { if (alive.current) setPhase('ready'); }
    if (ieltsMock && auto.current && alive.current && current.current.prepared) await start(true);
  }
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      if (!task || requested !== null && !single) { setPhase('invalid'); return; }
      // A completed session always opens its result, even after draft cleanup or browser Back.
      if (session) {
        const completed = await learningStore.get('attempts', session);
        if (cancelled) return;
        if (completed?.taskId === task.id && (!single || completed.answers.length === 1 && completed.answers[0].questionIndex === Number(requested)) && (!completed.ownerId || completed.ownerId === user?.id)) { navigate(`/practice/review?id=${session}`, { replace: true }); return; }
      }
      const saved = await learningStore.get('drafts', draftKey);
      if (cancelled) return;
      if (session && saved?.attemptId !== session) { setPhase('missing'); return; }
      if (!saved || saved.stage === 'intro') {
        navigate(examPath(task, { questionIndex: single ? Number(requested) : null, parentId, focus, part, sessionMode, session: session || '', stage: 'prepare' }), { replace: true });
        return;
      }
      const value = { ...saved, id: saved.attemptId, stage: 'exam' };
      current.current = value; setDraft(value); setText(value.text || ''); setHeard(Boolean(value.heard));
      if (value.recordingId) {
        const clip = await learningStore.get('recordings', value.recordingId);
        if (!cancelled && clip?.blob) setAudioUrl(URL.createObjectURL(clip.blob));
      }
      if (!cancelled) setPhase(value.recordingId ? 'review' : 'ready');
    })().catch(e => { if (!cancelled) { setError(e.message); setPhase('load-error'); } });
    return () => {
      cancelled = true; alive.current = false; auto.current = false;
      // onSave persists the final clip even when a route unmounts this component.
      capture.current?.dispose(); void take.current?.stop(); audioManager.stop();
    };
  }, [draftKey]);
  useEffect(() => { if (audioUrl) return () => URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => {
    const guard = event => {
      if (working.includes(phase) || phase === 'preparing' || writeError.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [phase]);
  useEffect(() => {
    if (!['recording', 'preparing'].includes(phase)) return;
    const timer = setInterval(() => {
      if (!deadline.current) return;
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); setRemaining(seconds);
      if (!seconds) {
        deadline.current = 0;
        if (phase === 'preparing') void finishPreparation();
        else void stop();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (isMock && params.get('autostart') === '1' && phase === 'ready' && index === 0 && !draft?.mockStarted && !autoStartTriggered.current) {
      autoStartTriggered.current = true;
      void update({ mockStarted: true }).then(() => playRef.current?.()).catch(e => setError(e.message));
    }
  }, [isMock, phase, index, draft?.mockStarted]);
  useEffect(() => {
    if (isMock && draft?.stage === 'exam' && index > 0 && !draft.recordingId && phase === 'ready' && auto.current) void playRef.current?.();
  }, [index, phase]);
  async function playPrompt() {
    if (lock.current || busy) return;
    if (sessionMode === 'exam' && current.current.heard) return;
    lock.current = true; setError(''); setPhase('playing');
    let ok = false;
    try {
      let spoken = prompt;
      if (ieltsMock) {
        let examiner;
        try { examiner = await apiJson('/api/exam-examiner', { taskId: task.id, sessionId: current.current.id, questionIndex, answers: current.current.answers.map(answer => ({ questionIndex: answer.questionIndex, text: answer.text })) }); }
        catch { examiner = { text: `${questionIndex === 0 ? 'Good morning. Let us begin. ' : task.steps[questionIndex - 1]?.part !== step.part ? `We will now move to Part ${step.part}. ` : ''}${prompt}`, source: 'script' }; }
        spoken = examiner.text;
        await update({ examinerTurns: [...(current.current.examinerTurns || []).filter(turn => turn.questionIndex !== questionIndex), { questionIndex, text: spoken, source: examiner.source }], examinerSource: examiner.source });
      }
      ok = await audioManager.playFixedVoice(ieltsMock ? `examiner-${task.id}-${questionIndex}` : fixedPromptAudioId(task, questionIndex), spoken, 'female', { concise: false, maxSentences: 20, maxChars: 3000 });
      if (!alive.current) return;
      if (ok) { setHeard(true); await update({ heard: true }); }
      else setError('Question audio unavailable. Try again.');
    } catch (e) { if (alive.current) setError(e.message || 'Question audio unavailable. Try again.'); }
    finally { lock.current = false; if (alive.current) setPhase(current.current.recordingId ? 'review' : 'ready'); }
    if (ok && (isMock || sessionMode === 'exam') && alive.current) {
      auto.current = true;
      if (preparationSeconds > 0 && !current.current.prepared) { preparing.current = true; deadline.current = Date.now() + preparationSeconds * 1000; setRemaining(preparationSeconds); setPhase('preparing'); }
      else await start(true);
    }
  }
  playRef.current = playPrompt;
  async function finishRecording() {
    if (discarding.current) return;
    if (stopJob.current) return stopJob.current;
    const thisTake = take.current, generation = recordingGeneration.current;
    if (!thisTake) return;
    deadline.current = 0; if (alive.current) setPhase('processing');
    stopJob.current = (async () => {
      const id = await thisTake.stop();
      if (generation !== recordingGeneration.current) return;
      if (!id) { if (alive.current) { setError('Recording unavailable. Record again.'); setPhase('review'); } auto.current = false; return; }
      await update({ recordingId: id, durationSeconds: Math.max(0, (Date.now() - started.current) / 1000) });
      if (!alive.current) return;
      const clip = await learningStore.get('recordings', id);
      if (clip?.blob) setAudioUrl(URL.createObjectURL(clip.blob));
      setPhase('review');
      if (isMock && auto.current && sessionMode === 'exam') await finishRef.current?.(true);
    })().catch(e => { auto.current = false; if (alive.current) { setError(e.message); setPhase('review'); } });
    return stopJob.current;
  }
  async function stop() {
    if (!capture.current || stopJob.current) return;
    deadline.current = 0; setPhase('processing');
    await capture.current.stop({ submit: false });
    await finishRecording();
  }
  async function start(force = false) {
    if (lock.current || (!force && busy) || preparing.current) return;
    if (current.current.recordingId && !window.confirm('Replace this answer’s recording and transcript? The previous take will remain available until the new recording is saved.')) return;
    lock.current = true; setError(''); setPhase('permission'); audioManager.stop(); capture.current?.dispose();
    stopJob.current = null; const generation = ++recordingGeneration.current;
    const previous = { text: current.current.text || '', rawTranscript: current.current.rawTranscript || '', recordingId: current.current.recordingId || null };
    let recordingStarted = false;
    const saveRecording = async recording => {
      if (discarding.current) return;
      await learningStore.put('recordings', recording);
      if (recording.complete) void cacheRecordingQuality(recording).catch(() => {});
      // Recordings belong to this question/generation, never the next question.
      if (generation === recordingGeneration.current) await update({ recordingId: recording.id, durationSeconds: recording.durationSeconds, recordingIds: [...new Set([...(current.current.recordingIds || []), recording.id])] });
    };
    take.current = new AudioTake({ onSave: saveRecording, onCheckpoint: saveRecording,
      onError: message => { auto.current = false; if (alive.current) setError(message); } });
    const recordedTake = take.current;
    capture.current = new VoiceCapture({ onUsage: usage => { if (recordedTake.id) void apiJson('/api/membership', { action: 'measurement', sessionId: current.current.id, id: recordedTake.id, usageType: usage.usageType, seconds: usage.seconds }).catch(() => {}); }, retainStream: true, allowRecordingOnly: true, maxRecordingMs: answerSeconds * 1000,
      onEvent: event => {
        if (!alive.current || generation !== recordingGeneration.current) return;
        if (event.type === 'stream') {
          take.current.start(event.stream);
          if (!take.current.recorder) { capture.current.cancel(); setError('Audio recording unavailable. Use another browser.'); setPhase('ready'); return; }
          recordingStarted = true; started.current = Date.now(); deadline.current = Date.now() + answerSeconds * 1000; setRemaining(answerSeconds);
          void update({ text: '', rawTranscript: '', recordingId: null }); setAudioUrl('');
          setPhase('recording');
        }
        if (event.type === 'phase' && !['listening', 'starting'].includes(event.phase)) {
          if (event.phase === 'requesting_permission') setPhase('permission');
          if (['stopping', 'finalizing'].includes(event.phase)) setPhase('processing');
        }
        if (event.type === 'transcript' && recordingStarted) {
          const raw = [event.final, event.interim].filter(Boolean).join(' '); void update({ text: raw, rawTranscript: raw });
        }
        if (event.type === 'error') {
          auto.current = false; deadline.current = 0; setError(event.message.replace(/ Your words.*|; retry.*| or type.*| Use a supported.*| Check permissions.*/g, ''));
          if (recordingStarted) void finishRecording(); else { void update(previous); setPhase(previous.recordingId ? 'review' : 'ready'); }
        }
        if (event.type === 'stopped') void finishRecording();
      }
    });
    const recordedCapture = capture.current;
    try {
      await prepareRecordedTranscription(recordedCapture, recordedTake);
      if (!alive.current || generation !== recordingGeneration.current) return;
      await recordedCapture.start({ autoEnd: ieltsMock && stepType !== 'part2', silenceMs: 2500 });
    }
    catch (e) { setError(e.message); setPhase('ready'); }
    finally { lock.current = false; }
  }
  async function accept(force = false, finishEarly = false) {
    if (!alive.current || lock.current || (!force && busy) || (!current.current.recordingId && !(finishEarly && current.current.answers.length))) return;
    lock.current = true; setPhase('saving'); setError('');
    try {
      let next = current.current;
      if (current.current.recordingId) {
        const clip = await learningStore.get('recordings', current.current.recordingId);
        if (!clip?.blob?.size) throw new Error('Recording unavailable. Record again.');
        const answer = { questionIndex, ...(task.questions?.[questionIndex] ? { questionId: task.questions[questionIndex].questionId, setId: task.setId } : {}), prompt, text: (current.current.text || '').trim(), rawTranscript: current.current.rawTranscript || '',
          recordingId: current.current.recordingId, inputMode: 'voice', durationSeconds: current.current.durationSeconds || 0, startSeconds: null };
        next = { ...current.current, answers: [...current.current.answers, answer], text: '', rawTranscript: '', recordingId: null, prepared: false, heard: false, notes: '', durationSeconds: 0 };
      }
      await writes.current;
      if (finishEarly || next.answers.length === indices.length) {
        await saveAttempt(next);
        await apiJson('/api/membership', { action: 'finish', id: next.id }).catch(() => {});
        // Keep the completed session ID in the URL; restoring checks attempts first.
        await learningStore.remove('drafts', draftKey);
        auto.current = false; navigate(`/practice/review?id=${next.id}${next.answers.some(answer => answer.text.trim()) ? '&generate=1' : ''}`, { replace: true });
      } else {
        await persist(next); ++recordingGeneration.current; take.current = null; capture.current?.dispose(); capture.current = null; stopJob.current = null;
        setAudioUrl(''); setHeard(false); setPhase('ready');
      }
    } catch (e) { auto.current = false; setError(e.message); setPhase('review'); }
    finally { lock.current = false; }
  }
  finishRef.current = accept;
  async function discard() {
    if (lock.current || discarding.current || !window.confirm('Discard this unfinished practice and its recordings? Your earlier saved practices will stay.')) return;
    discarding.current = true; auto.current = false; deadline.current = 0;
    ++recordingGeneration.current; setPhase('saving'); audioManager.stop(); capture.current?.dispose();
    try {
      await take.current?.stop(); await writes.current.catch(() => {});
      await discardPracticeDraft(draftKey, [take.current?.id]);
      void apiJson('/api/membership', { action: 'cancel', id: current.current.id }).catch(() => {});
      navigate(task.bankTaskType ? questionBankPath(task.bankTaskType) : '/exam', { replace: true });
    } catch (issue) { discarding.current = false; setError(issue.message); setPhase('review'); }
  }
  async function exit() {
    if (lock.current || phase === 'saving') return;
    auto.current = false;
    try { if (capture.current) await stop(); await writes.current; navigate(task.bankTaskType ? questionBankPath(task.bankTaskType) : '/exam'); }
    catch (e) { setError(e.message); }
  }
  if (phase === 'invalid' || !task) return <main className="learning-page"><h1>Task not found</h1><Link to="/exam">Choose a task</Link></main>;
  if (phase === 'missing') return <main className="learning-page"><h1>Practice unavailable</h1><Link to="/progress">My Progress</Link></main>;
  if (!draft) return <main className="learning-page"><p role={error ? 'alert' : 'status'}>{error || 'Loading…'}</p>{error && <button onClick={() => window.location.reload()}>Retry loading</button>}</main>;
  const title = task.setTitle || `${task.exam === 'ielts' ? 'IELTS Speaking' : 'TOEFL Speaking'} · ${task.title.split(' · ')[0]}`;
  const canRecord = !busy && phase !== 'preparing' && !(sessionMode === 'exam' && draft.recordingId) && (!preparationSeconds || draft.prepared) && (!(stepType === 'listen-repeat' || isMock) || heard);
  return <ActiveExamPage title={title} sessionMode={sessionMode} index={index} indices={indices} stepType={stepType} draft={draft} prompt={prompt} task={task} busy={busy} phase={phase} isMock={isMock} heard={heard} playPrompt={playPrompt} preparationSeconds={preparationSeconds} remaining={remaining} setRemaining={setRemaining} setPhase={setPhase} preparing={preparing} deadline={deadline} update={update} finishPreparation={finishPreparation} stop={() => { auto.current = false; return stop(); }} canRecord={canRecord} start={start} audioUrl={audioUrl} setError={setError} text={text} accept={accept} error={error} exit={exit} discard={discard} auto={auto} />;
}

function ActiveExamPage({ title, sessionMode, index, indices, stepType, draft, prompt, task, busy, phase, isMock, heard, playPrompt, preparationSeconds, remaining, setRemaining, setPhase, preparing, deadline, update, finishPreparation, stop, canRecord, start, audioUrl, setError, text, accept, error, exit, discard, auto }) {
  return <main className="learning-page exam-page"><header><span>{['ielts-mock','ielts-paired'].includes(task.type) ? `IELTS Speaking · Part ${task.steps[indices[index]]?.part}` : title}</span><span>Question {index + 1} / {indices.length}</span></header>
    <p className="session-mode-label">{sessionMode === 'exam' ? 'Exam mode · one playback, one take' : 'Practice mode'}</p>
    <section className="exam-question"><h1>{stepType === 'listen-repeat' ? 'Listen and Repeat' : prompt}</h1>
      {task.questions?.[indices[index]]?.sourceLanguage === 'zh' && <p className="learning-muted">Answer in English. This source prompt is in Chinese.</p>}
      {stepType === 'part2' && (task.questions?.[indices[index]]?.cuePoints || task.cuePoints) && <ul>{(task.questions?.[indices[index]]?.cuePoints || task.cuePoints).map(p => <li key={p}>{p}</li>)}</ul>}
      {stepType === 'part2' && draft.notes && phase !== 'preparing' && <blockquote>{draft.notes}</blockquote>}
      {!busy && phase !== 'preparing' && !(sessionMode === 'exam' && heard) && (stepType === 'listen-repeat' || task.bankTaskType === 'interview' || task.exam === 'ielts' && task.questions?.[indices[index]]?.sourceLanguage !== 'zh' || task.audio?.[index] || isMock && !auto.current) && <button onClick={playPrompt}>{isMock ? 'Resume mock' : stepType === 'listen-repeat' ? heard ? 'Listen again' : 'Play sentence' : 'Listen to question'}</button>}
      {task.type === 'ielts-mock' && draft.examinerSource === 'script' && <p className="learning-muted">Continuing with the practice questions.</p>}
      {preparationSeconds > 0 && !draft.prepared && phase === 'ready' && <button onClick={() => { preparing.current = true; deadline.current = Date.now() + preparationSeconds * 1000; setRemaining(preparationSeconds); setPhase('preparing'); }}>Start 1-minute preparation</button>}
      {phase === 'preparing' && <><p className="learning-timer" role="timer">Preparation · {remaining}s</p><textarea aria-label="Preparation notes" value={draft.notes || ''} onChange={e => void update({ notes: e.target.value })} /><button onClick={finishPreparation}>Finish preparation early</button></>}
      {phase === 'recording' && <p className="learning-timer" role="timer">Recording · {remaining}s</p>}
      {['permission', 'playing', 'processing', 'saving'].includes(phase) && <p role="status">{{ permission: 'Microphone permission pending', playing: 'Playing question', processing: 'Processing', saving: 'Saving' }[phase]}</p>}
      <div className="learning-actions">{phase === 'recording' ? <button className="primary" onClick={stop}>Stop recording</button> : (!isMock || draft.recordingId || error) && <button className={draft.recordingId ? '' : 'primary'} disabled={!canRecord} onClick={() => start()}>{draft.recordingId ? sessionMode === 'practice' ? 'Try again' : 'Record another take' : 'Record answer'}</button>}</div>
      {audioUrl && !busy && sessionMode === 'practice' && <audio controls src={audioUrl} aria-label="Review recording" onError={() => setError('Recording could not be played. Record again.')} />}
      {draft.recordingId && !busy && sessionMode === 'practice' && <label>Your transcript<textarea aria-label="Your transcript" value={text} maxLength={8000} onChange={e => void update({ text: e.target.value })} /></label>}
      {stepType === 'listen-repeat' && draft.recordingId && !busy && sessionMode === 'practice' && <details className="repeat-reference"><summary>Reveal reference sentence</summary><p>{prompt}</p></details>}
      {draft.recordingId && phase === 'review' && sessionMode === 'practice' && <><AnswerFeedback key={`${draft.recordingId}:${text}`} repeat={stepType === 'listen-repeat'} attempt={{ id: draft.id, track: 'exam', taskId: task.id, practiceMode: 'quick', answers: [{ questionIndex: indices[index], prompt, text, recordingId: draft.recordingId, inputMode: 'voice' }] }} /><RecordingQuality recordingId={draft.recordingId} /></>}
      {draft.recordingId && !busy && !text.trim() && sessionMode === 'practice' && <p className="learning-muted">Your recording can be checked without a transcript. Add text if you also want language feedback.</p>}
      {draft.recordingId && !busy && <button className="primary" onClick={() => accept()}>{index + 1 === indices.length ? sessionMode === 'exam' ? 'Submit exam' : text.trim() ? 'Finish and get feedback' : 'Finish practice' : 'Next Question'}</button>}
    </section>{error && <p role="alert" className="learning-alert">{error}</p>}
    <footer>{!busy && (draft.answers.length > 0 || draft.recordingId) && index + (draft.recordingId ? 1 : 0) < indices.length && <button onClick={() => accept(false, true)}>Finish early &amp; review answered questions</button>}<button disabled={phase === 'saving' || phase === 'permission' || phase === 'playing' || phase === 'processing'} onClick={exit}>Save and exit</button><button disabled={phase === 'saving' || phase === 'permission' || phase === 'playing'} onClick={discard}>Exit without saving</button></footer>
  </main>;
}
