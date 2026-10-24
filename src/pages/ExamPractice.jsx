import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getSpeakingTask } from '../../shared/speakingTasks';
import { VoiceCapture } from '@/lib/voice/VoiceCapture';
import { AudioTake } from '@/lib/voice/AudioTake';
import { audioManager } from '@/lib/audioManager';
import { learningStore, saveAttempt } from '@/lib/learningStore';
import { useAuth } from '@/lib/AuthContext';
import '@/learning.css';
export default function ExamPractice() {
  const location = useLocation(),
    navigate = useNavigate(),
    {
      user
    } = useAuth();
  const params = new URLSearchParams(location.search),
    task = getSpeakingTask(params.get('task'));
  const requestedQuestion = params.get('question');
  const indices = requestedQuestion !== null && task?.prompts[Number(requestedQuestion)] !== undefined ? [Number(requestedQuestion)] : task?.prompts.map((_, i) => i) || [];
  const parentId = params.get('retry') || null,
    focus = params.get('focus') || '';
  const [draft, setDraft] = useState(null),
    [phase, setPhase] = useState('ready'),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [remaining, setRemaining] = useState(0),
    [heard, setHeard] = useState(false),
    [audioUrl, setAudioUrl] = useState('');
  const capture = useRef(null),
    take = useRef(null),
    alive = useRef(true),
    draftRef = useRef(null),
    textRef = useRef(''),
    deadline = useRef(0),
    started = useRef(0),
    stopRef = useRef(null),
    lock = useRef(false),
    recordId = useRef(null),
    writeChain = useRef(Promise.resolve());
  const draftKey = `exam:${user?.id || 'guest'}:${task?.id}:${parentId || 'new'}:${focus}:${requestedQuestion || 'all'}`;
  const index = draft?.answers.length || 0;
  const questionIndex = indices[index];
  const prompt = task?.prompts[questionIndex];
  const isMock = task?.type === 'mock';
  const stepType = task?.steps?.[questionIndex]?.type || task?.type;
  const preparationSeconds = task?.steps?.[questionIndex]?.preparationSeconds ?? task?.timing.preparationSeconds;
  const answerSeconds = task?.steps?.[questionIndex]?.answerSeconds || task?.timing.answerSeconds;
  const autoAdvance = useRef(false), acceptRef = useRef(null), startRef = useRef(null), playRef = useRef(null);
  useEffect(() => {
    if (isMock && draft?.answers.length && !textRef.current && !draft.recordingId) void playRef.current?.();
  }, [isMock, questionIndex]);
  const busy = ['requesting_permission', 'starting', 'listening', 'stopping', 'finalizing', 'playing', 'saving'].includes(phase);
  const persist = value => {
    draftRef.current = value;
    setDraft(value);
    writeChain.current = writeChain.current.catch(() => {}).then(() => learningStore.put('drafts', {
      ...value,
      id: draftKey,
      attemptId: value.id
    })).catch(e => {
      if (alive.current) setError(e.message);
    });
  };
  const changeText = value => {
    textRef.current = value;
    setText(value);
    if (draftRef.current) persist({
      ...draftRef.current,
      text: value
    });
  };
  useEffect(() => {
    alive.current = true;
    learningStore.get('drafts', draftKey).then(saved => {
      if (!alive.current) return;
      const value = saved ? {
        ...saved,
        id: saved.attemptId
      } : {
        id: crypto.randomUUID(),
        track: 'exam',
        taskId: task?.id,
        answers: [],
        parentId,
        focus,
        question: requestedQuestion,
        practiceMode: requestedQuestion !== null ? 'quick' : isMock ? 'mock' : 'set',
        createdAt: new Date().toISOString(),
        ownerId: user?.id || null
      };
      draftRef.current = value;
      setDraft(value);
      textRef.current = value.text || '';
      setText(value.text || '');
      recordId.current = value.recordingId || null;
      if (value.recordingId) learningStore.get('recordings', value.recordingId).then(clip => {
        if (alive.current && clip?.blob) setAudioUrl(URL.createObjectURL(clip.blob));
      });
      if (saved) setNotice('Recovered your unfinished practice. Review your transcript or record again.');
    }).catch(e => setError(e.message));
    return () => {
      alive.current = false;
      capture.current?.dispose();
      void take.current?.stop();
      audioManager.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [draftKey]);
  useEffect(() => {
    if (!audioUrl) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);
  useEffect(() => {
    if (!['preparing', 'listening', 'starting'].includes(phase)) return;
    const timer = setInterval(() => {
      if (!deadline.current) return;
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) {
        deadline.current = 0;
        if (phase === 'preparing') {
          persist({
            ...draftRef.current,
            prepared: true
          });
          setPhase('ready');
          setNotice('Preparation finished. Start your answer.');
        } else void stopRef.current?.();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase]);
  async function playPrompt() {
    if (lock.current) return;
    lock.current = true;
    setError('');
    setPhase('playing');
    try {
      const ok = await audioManager.playAIVoice(task.prompts[questionIndex], 'female', {
        concise: false,
        maxSentences: 20,
        maxChars: 3000
      });
      if (!alive.current) return;
      if (ok) { setHeard(true); if (isMock) autoAdvance.current = true; } else setError('Prompt playback did not finish. Retry playback before recording.');
    } catch {
      if (alive.current) setError('Prompt playback failed. Retry or use a browser with speech playback.');
    } finally {
      lock.current = false;
      if (alive.current) { setPhase('ready'); if (isMock && autoAdvance.current) void startRef.current?.(true); }
    }
  }
  playRef.current = playPrompt;
  async function stop() {
    if (!capture.current) return;
    setPhase('stopping');
    deadline.current = 0;
    await capture.current.stop({
      submit: false
    });
    if (isMock) return; // The stopped event saves and advances this same capture.
    const id = await take.current?.stop();
    recordId.current = id || null;
    if (!alive.current) return;
    if (id) {
      const recording = await learningStore.get('recordings', id);
      if (alive.current) setAudioUrl(URL.createObjectURL(recording.blob));
    }
    persist({
      ...draftRef.current,
      text: textRef.current,
      recordingId: id || null,
      durationSeconds: Math.max(0, (Date.now() - started.current) / 1000)
    });
    setPhase('review');
  }
  stopRef.current = stop;
  async function start(force = false) {
    if (lock.current || (busy && !force)) return;
    lock.current = true;
    setError('');
    setNotice('');
    audioManager.stop();
    capture.current?.dispose();
    take.current = new AudioTake({
      onSave: async recording => {
        await learningStore.put('recordings', recording);
        if (alive.current && take.current?.id === recording.id) persist({
          ...draftRef.current,
          text: textRef.current,
          recordingId: recording.id
        });
      },
      onError: message => alive.current && setError(message)
    });
    capture.current = new VoiceCapture({
      retainStream: true,
      allowRecordingOnly: true,
      maxRecordingMs: answerSeconds * 1000,
      onEvent: event => {
        if (!alive.current) return;
        if (event.type === 'stream') take.current.start(event.stream);
        if (event.type === 'phase') {
          setPhase(event.phase);
          if (event.phase === 'listening' && !deadline.current) {
            started.current = Date.now();
            deadline.current = Date.now() + answerSeconds * 1000;
            setRemaining(answerSeconds);
          }
        }
        if (event.type === 'transcript') changeText([event.final, event.interim].filter(Boolean).join(' '));
        if (event.type === 'notice') setNotice(event.message);
        if (event.type === 'error') {
          deadline.current = 0;
          setPhase('review');
          setError(event.message);
          void take.current.stop();
        }
        if (event.type === 'stopped') {
          deadline.current = 0;
          setPhase('review');
          void take.current.stop().then(async id => {
            if (!alive.current) return;
            recordId.current = id || null;
            persist({
              ...draftRef.current,
              text: textRef.current,
              recordingId: id || null,
              durationSeconds: Math.max(0, (Date.now() - started.current) / 1000)
            });
            if (isMock && autoAdvance.current) { autoAdvance.current = false; if (id || textRef.current.trim()) await acceptRef.current?.(true); else setError('No audio or transcript was captured. Retry this question.'); }
            if (id && !isMock) {
              const clip = await learningStore.get('recordings', id);
              if (alive.current) setAudioUrl(URL.createObjectURL(clip.blob));
            }
          });
        }
      }
    });
    deadline.current = 0;
    await capture.current.start();
    lock.current = false;
  }
  startRef.current = start;
  async function accept(force = false) {
    if (!alive.current || lock.current || (busy && !force) || (!textRef.current.trim() && !(isMock && recordId.current))) return;
    lock.current = true;
    setPhase('saving');
    setError('');
    try {
      const id = (await take.current?.stop()) || recordId.current;
      const answer = {
        questionIndex,
        prompt,
        text: textRef.current.trim(),
        recordingId: id || null,
        inputMode: id ? 'voice' : 'text',
        durationSeconds: draftRef.current.durationSeconds || 0,
        startSeconds: recordId.current ? Math.max(0,(started.current-Date.parse(draftRef.current.createdAt))/1000) : null
      };
      const next = {
        ...draftRef.current,
        answers: [...draftRef.current.answers, answer],
        text: '',
        recordingId: null,
        durationSeconds: 0
      };
      if (next.answers.length === indices.length) {
        await writeChain.current;
        await saveAttempt(next);
        await learningStore.remove('drafts', draftKey);
        navigate(`/practice/review?id=${next.id}`);
      } else {
        persist(next);
        textRef.current = '';
        setText('');
        recordId.current = null;
        take.current = null;
        setAudioUrl('');
        setHeard(false);
        setNotice('Answer saved on this device. Continue with the next question.');
        setPhase('ready');
      }
    } catch (e) {
      setError(e.message);
      setPhase('review');
    } finally {
      lock.current = false;
    }
  }
  acceptRef.current = accept;
  if (!task) return <main className="learning-page"><h1>Task not found</h1><Link to="/exam">Choose a task</Link></main>;
  if (!draft) return <main className="learning-page"><p role="status">{error || 'Restoring your practice…'}</p><Link to="/exam">Back to tasks</Link></main>;
  return <main className="learning-page"><header><Link to="/exam">← Exam practice</Link><span>{index + 1} / {indices.length}</span></header><p className="learning-kicker">{task.exam.toUpperCase()} · Original simulation</p><h1>{task.title}</h1>{isMock && <p className="learning-muted">{stepType === 'listen-repeat' ? 'Listen and Repeat' : 'Take an Interview'} · {answerSeconds}s · automatic progression. {task.instructions}</p>}{focus && <p className="learning-alert">Retry focus: {focus}</p>}<section className="learning-card">
    {stepType === 'listen-repeat' ? <><p>{task.instructions}</p><p className="learning-muted">Browser voice · original simulated sentence</p><button disabled={busy} onClick={playPrompt}>{isMock ? 'Begin / resume mock' : heard ? 'Listen again' : 'Play sentence'}</button>{!isMock && phase === 'review' && <blockquote>{prompt}</blockquote>}</> : <><h2>{isMock ? "Listen to the interview question." : prompt}</h2>{stepType === 'part2' && task.cuePoints && <ul>{task.cuePoints.map(p => <li key={p}>• {p}</li>)}</ul>}<button disabled={busy || phase === 'preparing'} onClick={playPrompt}>{isMock ? "Begin / resume mock" : "Listen to question"}</button></>}
    <p className="learning-muted">{stepType === 'part2-followup' ? 'Brief examiner follow-up · 30-second practice cap, not an official per-question limit' : task.timing.basis}</p>
    {preparationSeconds > 0 && !draft.prepared && phase === 'ready' && <button onClick={() => {
        deadline.current = Date.now() + preparationSeconds * 1000;
        setRemaining(preparationSeconds);
        setPhase('preparing');
      }}>Start 1-minute preparation</button>}
    {phase === 'preparing' && <><p className="learning-timer" role="timer">Preparation · {remaining}s</p><textarea aria-label="Preparation notes" placeholder="Make brief notes…" value={draft.notes || ''} onChange={e => persist({
          ...draftRef.current,
          notes: e.target.value
        })} /><button onClick={() => {
          deadline.current = 0;
          persist({
            ...draftRef.current,
            prepared: true
          });
          setPhase('ready');
        }}>Finish preparation early</button></>}
    {['listening', 'starting'].includes(phase) && <p className="learning-timer" role="timer">Answer · {remaining}s</p>}
    <p role="status">{{
          ready: 'Ready to answer',
          playing: 'Playing question',
          requesting_permission: 'Allow microphone access',
          starting: 'Starting microphone',
          listening: 'Recording',
          stopping: 'Stopping recording',
          finalizing: 'Confirming transcript',
          review: 'Review your answer',
          saving: 'Saving answer'
        }[phase]}</p>
    {!isMock && <div className="learning-actions">{['listening', 'starting', 'requesting_permission'].includes(phase) ? <button className="primary" onClick={stop}>Stop recording</button> : <button className={text ? "" : "primary"} disabled={busy || phase === 'preparing' || preparationSeconds > 0 && !draft.prepared || stepType === 'listen-repeat' && !heard} onClick={() => start()}>{text ? 'Record another take' : 'Record answer'}</button>}</div>}
    {!isMock && audioUrl && <audio controls src={audioUrl} aria-label="Review recording" />}
    {!isMock && <label>Your transcript<textarea aria-label="Your transcript" value={text} disabled={busy || phase === 'preparing'} onChange={e => changeText(e.target.value)} placeholder="Speak, or type an answer if voice input is unavailable." /></label>}
    {!isMock && <p className="learning-muted">Review recognition mistakes before submitting. Feedback uses this text, not an acoustic pronunciation score.</p>}
    {!isMock && <button className={text.trim() ? "primary" : ""} disabled={busy || phase === 'preparing' || preparationSeconds > 0 && !draft.prepared || !text.trim() || stepType === 'listen-repeat' && !heard} onClick={() => accept()}>{index + 1 === indices.length ? 'Finish and get feedback' : 'Save answer and continue'}</button>}
  </section>{notice && <p role="status" className="learning-muted">{notice}</p>}{error && <p role="alert" className="learning-alert">{error}</p>}<p className="learning-muted">Drafts and recordings stay on this device. Sign in after practice to sync them across devices.</p></main>;
}
