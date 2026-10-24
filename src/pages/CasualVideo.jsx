import { startVisionSession } from '@/lib/expressionVisionSession';
import { apiFetch } from "@/api/http";
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Square, Play, Download, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { createReviewClips, compareWithHistory, compareEvidence, EXPRESSION_METRICS, EXPRESSION_CONTEXTS, saveExample, rankReviewClips, learnedPatterns, FEATURE_VERSION } from '@/lib/expressionInsights';
import '@/casual-video.css';
import ExpressionPracticeLab, { PracticeOverview } from '@/components/ExpressionPracticeLab';
import { makePracticeRecord, savePracticeRecord, getDrill } from '@/lib/expressionPractice';
import '@/expression-practice.css';
import ExpressionBrief from '@/components/ExpressionBrief';
import ExpressionMethod from '@/components/ExpressionMethod';
import ExpressionConnection from '@/components/ExpressionConnection';
import { normalizeBrief, focusQuestion } from '@/lib/expressionContext';
import { getScenario } from '@/lib/scenarios';

const contexts = EXPRESSION_CONTEXTS;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function reviewVerdict(clips, usable, confirmed) {
  if (!clips.length) return { title: '没有可分析片段', action: '补充说话内容后再看结果。' };
  if (!usable.length) return { title: '暂时无法判断动作习惯', action: '先检查你的话，再重录一段光线稳定、脸和手都清楚的视频。' };
  const focus = clips.find(clip => clip.priority > 0) || clips[0];
  if (focus?.reviewLabel === 'Different from your usual range') return { title: '有一处动作和你平时不同', action: '回放标记片段，确认它是否影响了你的表达；确认后再决定是否练习。' };
  if (focus?.reviewLabel === 'Movement to revisit') return { title: '发现一处重复动作', action: '回放片段，判断动作是在强调重点，还是分散注意力。' };
  if (!confirmed) return { title: '暂时没有确认的表达习惯', action: '先回放一个片段，选择“这很像我”或“识别不准确”。' };
  return { title: '目前没有明显异常', action: '继续积累相同场景的样本，结果会更个性化。' };
}

async function openCamera() {
  let expired = false;
  let timer;
  const request = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: true });
  const pending = request.then(stream => {
    if (expired) { stream.getTracks().forEach(t => t.stop()); throw new Error('Camera request expired.'); }
    return stream;
  });
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Camera access is taking too long. Check the browser permission prompt, then try again.')); }, 20000);
    })]);
  } finally { clearTimeout(timer); }
}

export default function CasualVideo() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [brief, setBrief] = useState(() => {
    const scene = getScenario(params.get('scenario'));
    return { scenarioId: scene?.id || 'personal', listener: scene ? ['office', 'hospital', 'university'].includes(scene.id) ? 'professional' : 'service' : 'peer',
      goal: scene?.goalOriented.goal || '', focus: 'clarity', position: 'seated' };
  });
  const [recordedBrief, setRecordedBrief] = useState(null);
  const [preparingScene, setPreparingScene] = useState(false);
  const [modelUsed, setModelUsed] = useState(null);
  const key = `speaknow.expression.v1.${user?.id || 'guest'}`;
  const [status, setStatus] = useState('idle');
  const [vision, setVision] = useState('idle');
  const [notice, setNotice] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState('');
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);
  const [liveText, setLiveText] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesNotice, setNotesNotice] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [playingClip, setPlayingClip] = useState(null);
  const [reviewingClip, setReviewingClip] = useState(null);
  const playbackRange = useRef(null);
  const [experiment, setExperiment] = useState(null);
  const [practiceRecords, setPracticeRecords] = useState([]);
  const [experimentSaved, setExperimentSaved] = useState(false);
  const practiceKey = `${key}.practice`;
  const beforeUrlRef = useRef('');
  const video = useRef(null);
  /** @type {import('react').MutableRefObject<{
   * active: boolean, mounted: boolean, worker: { terminate: () => void } | null,
   * stream: MediaStream | null, recorder: MediaRecorder | null,
   * recognition: SpeechRecognition | null, timer: ReturnType<typeof setInterval> | null,
   * url: string, samples: any[], utterances: any[], id: string,
   * start?: number, brief?: any, blob?: Blob,
   * pendingUtterance?: { start: number, text: string } | null
   * }>} */
  const run = useRef({ active: false, mounted: true, worker: null, stream: null, recorder: null, recognition: null, timer: null, url: '', samples: [], utterances: [], id: '' });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      setHistory(Array.isArray(saved) ? saved.filter(h => h && h.sessionId && h.metrics).slice(-240) : []);
    } catch { setNotice('Saved examples could not be loaded. You can still record a new session.'); }
  }, [key]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(practiceKey) || '[]');
      setPracticeRecords(Array.isArray(saved) ? saved.filter(r => r && typeof r.id === 'string' && typeof r.intention === 'string' && typeof r.reflection === 'string').slice(-60) : []);
    } catch { setNotice('Practice reflections could not be loaded. You can still try a new experiment.'); }
  }, [practiceKey]);

  useEffect(() => () => { if (beforeUrlRef.current) URL.revokeObjectURL(beforeUrlRef.current); }, []);

  useEffect(() => {
    if (status === 'review') {
      const target = document.getElementById(experiment ? 'expression-experiment' : 'expression-review');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [experiment?.id, status]);

  useEffect(() => {
    const state = run.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      state.active = false;
      clearInterval(state.timer);
      state.worker?.terminate();
      state.recognition?.abort();
      if (state.recorder?.state === 'recording') state.recorder.stop();
      state.stream?.getTracks().forEach(t => t.stop());
      if (state.url) URL.revokeObjectURL(state.url);
    };
  }, []);

  function stop() {
    const state = run.current;
    if (state.pendingUtterance?.text && state.active) {
      state.utterances.push({ ...state.pendingUtterance, end: (performance.now() - state.start) / 1000 });
      state.pendingUtterance = null;
    }
    state.active = false;
    clearInterval(state.timer);
    state.worker?.terminate();
    state.worker = null;
    state.recognition?.stop();
    if (state.recorder?.state === 'recording') state.recorder.stop();
    state.stream?.getTracks().forEach(t => t.stop());
    setStatus('finishing');
  }

  async function start() {
    if (['requesting', 'recording', 'finishing'].includes(status)) return;
    const nextBrief = normalizeBrief(experiment ? recordedBrief : brief);
    if (!nextBrief) { setNotice('Set your situation and what your listener should understand before recording.'); return; }
    setStatus('requesting');
    setExperimentSaved(false);
    setNotice('');
    const state = run.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('This browser cannot record video. Open this page in a recent browser over HTTPS or localhost.');
      const stream = await openCamera();
      if (!state.mounted) { stream.getTracks().forEach(t => t.stop()); return; }
      state.stream = stream;
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = '';
      playbackRange.current = null; setPlayingClip(null); setReviewingClip(null); setNotesNotice('');
      setUrl(''); setClips([]); setSeconds(0); setLiveText('');
      video.current.srcObject = stream;
      video.current.muted = true;
      await video.current.play();
      const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      state.recorder = recorder;
      state.samples = []; state.utterances = []; state.pendingUtterance = null; state.id = crypto.randomUUID();
      state.brief = nextBrief; setRecordedBrief(nextBrief); setPreparingScene(false); setModelUsed(null);
      state.start = performance.now(); state.active = true;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { setNotice('Recording was interrupted. Any captured video will be available below.'); stop(); };
      recorder.onstop = () => {
        if (!state.mounted) return;
        const duration = Math.min(120, (performance.now() - state.start) / 1000);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        state.blob = blob;
        state.url = URL.createObjectURL(blob);
        video.current.srcObject = null;
        video.current.muted = false;
        setUrl(state.url);
        setClips(createReviewClips(state.samples, state.utterances, duration).map(c => ({ ...c, sessionId: state.id, brief: state.brief })));
        setShowAll(false);
        setReviewFilter('all');
        setStatus('review');
      };
      recorder.start(1000);
      setStatus('recording');
      setVision('loading');
      const stopVision = startVisionSession(video.current, {
        onSample: sample => { if (state.active) state.samples.push(sample); },
        onStatus: setVision,
        clock: () => (performance.now() - state.start) / 1000,
      });
      state.worker = { terminate: stopVision };
      state.timer = setInterval(() => {
        if (!state.active) return;
        const time = (performance.now() - state.start) / 1000;
        setSeconds(Math.floor(time));
        if (time >= 120) stop();
      }, 250);
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        state.recognition = recognition;
        recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true;
        let phraseStart = null;
        recognition.onspeechstart = () => { phraseStart = (performance.now() - state.start) / 1000; };
        recognition.onresult = event => {
          if (!state.active) return;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            setLiveText(text);
            const end = (performance.now() - state.start) / 1000;
            if (event.results[i].isFinal) {
              state.utterances.push({ start: phraseStart ?? Math.max(0, end - 6), end, text });
              state.pendingUtterance = null;
              phraseStart = null;
            } else state.pendingUtterance = { start: phraseStart ?? Math.max(0, end - 6), text };
          }
        };
        recognition.onerror = event => {
          if (event.error === 'no-speech' || event.error === 'aborted') return;
          recognition.onend = null;
          recognition.abort();
          setNotice('Live transcription is unavailable. Add or correct the words when reviewing your clips.');
        };
        recognition.onend = () => { if (state.active) { try { recognition.start(); } catch { /* Recording continues independently. */ } } };
        try { recognition.start(); } catch { setNotice('Add the words you said during review; video recording is active.'); }
      } else setNotice('Live transcription is not supported here. Add your words during review.');
    } catch (error) {
      state.active = false;
      clearInterval(state.timer);
      state.worker?.terminate();
      state.stream?.getTracks().forEach(t => t.stop());
      setStatus(state.url ? 'review' : 'idle');
      setNotice(error.name === 'NotAllowedError' ? 'Camera or microphone permission was declined. Allow access in browser settings and try again.' : error.message || 'Recording could not start. Please try again.');
    }
  }

  function updateClip(id, patch) {
    setExperimentSaved(false);
    if ('text' in patch || 'context' in patch || 'personalNote' in patch || 'perceivedEffect' in patch) {
      const next = history.filter(h => !(h.sessionId === run.current.id && h.id === id));
      try { localStorage.setItem(key, JSON.stringify(next)); setHistory(next); }
      catch { setNotice('Could not update the saved example. Clear the notebook before saving a correction.'); return; }
    }
    setClips(current => current.map(c => c.id === id ? { ...c, ...(('text' in patch || 'context' in patch || 'personalNote' in patch || 'perceivedEffect' in patch) ? { suggestedContext: '', quote: '', note: '' } : {}), ...patch } : c));
  }

  function remember(clip, decision) {
    const example = { ...clip, decision, sessionId: run.current.id, date: new Date().toISOString() };
    const next = saveExample(history, example);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setHistory(next); updateClip(clip.id, { decision });
    } catch { setNotice('This browser could not save your example. Free some storage and try again.'); }
  }

  async function requestNotes() {
    const sessionId = run.current.id;
    const requested = rankReviewClips(clips, history).filter(c => c.text.trim()).slice(0, 12);
    setNotesBusy(true);
    setNotesNotice('');
    try {
      const response = await apiFetch('/api/expression-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: requested.map(c => ({ id: c.id, text: c.text, metrics: c.metrics, context: c.context, motion: c.motion, trajectory: c.trajectory,
          brief: c.brief, perceivedEffect: c.perceivedEffect || '', personalNote: c.personalNote || '', coverage: c.coverage,
          baseline: c.context ? compareEvidence(c, history) : null })) }), signal: AbortSignal.timeout(20000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.code === 'not_configured' ? 'Reflection questions are not connected yet. Your video, local observations and practice are available.' : 'Context notes are unavailable. Your video and local comparisons are still available.');
      if (result.source !== 'ai') throw new Error('Context notes need a working model connection. Your local observations are ready to review.');
      if (run.current.id === sessionId && run.current.mounted) setModelUsed({ provider: result.provider, model: result.model });
      if (run.current.id === sessionId && run.current.mounted) setClips(current => current.map(c => {
        const original = requested.find(r => r.id === c.id);
        const note = result.notes?.find(n => n.id === c.id);
        return note && original?.text === c.text && original?.context === c.context && original?.personalNote === c.personalNote && original?.perceivedEffect === c.perceivedEffect
          ? { ...c, note: note.question, suggestedContext: note.suggestedContext, quote: note.quote } : c;
      }));
    } catch (error) {
      if (run.current.id === sessionId && run.current.mounted) setNotesNotice(error.name === 'TimeoutError' ? 'Reflection questions took too long. Try again, or continue reviewing your moments.' : error.message);
    }
    finally { setNotesBusy(false); }
  }

  function replayClip(clip) {
    const player = video.current;
    if (!player) return;
    playbackRange.current = { start: clip.start, end: clip.end };
    setPlayingClip(clip.id);
    setReviewingClip(clip.id);
    player.currentTime = clip.start;
    player.scrollIntoView({ behavior: 'auto', block: 'center' });
    void player.play().catch(() => {
      playbackRange.current = null;
      setPlayingClip(null);
      setNotice('Press play on the video to review this moment.');
    });
  }

  function checkPlaybackRange() {
    const player = video.current;
    const range = playbackRange.current;
    if (!player || !range) return;
    if (player.currentTime >= range.end) {
      playbackRange.current = null;
      player.pause();
      player.currentTime = range.end;
      setPlayingClip(null);
    } else if (player.currentTime < range.start - 0.25) {
      playbackRange.current = null;
      setPlayingClip(null);
    }
  }

  function beginExperiment(clip) {
    if (!run.current.blob || !clip.text.trim()) return;
    video.current?.pause();
    setPreparingScene(false);
    if (beforeUrlRef.current) URL.revokeObjectURL(beforeUrlRef.current);
    beforeUrlRef.current = URL.createObjectURL(run.current.blob);
    setExperiment({ id: crypto.randomUUID(), before: structuredClone(clip), beforeUrl: beforeUrlRef.current,
      drillId: { clarity: 'point', structure: 'example', emphasis: 'emphasis', movement: 'movement' }[clip.brief?.focus] || 'point', intention: '' });
    setExperimentSaved(false);
  }

  function closeExperiment() {
    if (beforeUrlRef.current) URL.revokeObjectURL(beforeUrlRef.current);
    beforeUrlRef.current = '';
    setExperiment(null);
  }

  function finishExperiment(result) {
    const record = makePracticeRecord({ experiment, ...result });
    if (!record) { setNotice('Confirm the same idea, choose your preference and add a specific reflection before saving.'); return; }
    const next = savePracticeRecord(practiceRecords, record);
    try { localStorage.setItem(practiceKey, JSON.stringify(next)); setPracticeRecords(next); setExperimentSaved(true); }
    catch { setNotice('Could not save your reflection in this browser. Your comparison is still available.'); }
  }

  const priorHistory = history.filter(h => h.sessionId !== run.current.id);
  const ranked = rankReviewClips(clips, priorHistory);
  const usable = clips.filter(c => c.coverage >= 0.5 && Object.keys(c.metrics).length);
  const confirmed = clips.filter(c => c.decision === 'habit').length;
  const filters = [
    { id: 'all', label: 'All moments', count: ranked.length },
    { id: 'pending', label: 'To review', count: clips.filter(c => !c.decision).length },
    { id: 'habit', label: 'Confirmed', count: confirmed },
    { id: 'rejected', label: 'Excluded', count: clips.filter(c => c.decision === 'rejected').length },
  ];
  const filtered = ranked.filter(c => reviewFilter === 'all' || (reviewFilter === 'pending' ? !c.decision : c.decision === reviewFilter));
  const visibleClips = showAll ? filtered : filtered.slice(0, 4);
  const activeBrief = recordedBrief || normalizeBrief(brief);
  const patterns = activeBrief ? learnedPatterns(history, activeBrief) : [];
  const verdict = reviewVerdict(ranked, usable, confirmed);
  return <main className="expression-page">
    <Link to="/voice" className="expression-back"><ArrowLeft size={18} /> Casual Situation</Link>
    <header><p className="expression-eyebrow">THE EXPRESSION LAB</p><h1>Make your point.</h1></header>
    <ExpressionBrief value={status === 'idle' || preparingScene ? brief : recordedBrief || brief} onChange={setBrief}
      locked={['requesting', 'recording', 'finishing'].includes(status) || (status === 'review' && !preparingScene)} onNewBrief={status === 'review' && !experiment ? () => { setPreparingScene(true); document.querySelector('.expression-brief')?.scrollIntoView({ block: 'start' }); } : null} />
    {status !== 'recording' && <details><summary>Practice guide</summary><ExpressionMethod /><ExpressionConnection /></details>}
    <div className="expression-layout">
      <section className="expression-panel">
        {experiment && status === 'recording' && <div className="practice-live"><p className="expression-eyebrow">ONE FOCUS · {getDrill(experiment.drillId).skill}</p><p>{experiment.intention}</p><p className="expression-small">Take your time. Aim for about {getDrill(experiment.drillId).time}, then compare both versions.</p></div>}
        <div className="expression-controls">
          {status === 'recording' ? <button onClick={stop}><Square size={17} /> Finish & review</button> : <button onClick={start} disabled={status === 'requesting' || status === 'finishing' || Boolean(experiment && !experiment.intention.trim()) || !normalizeBrief(experiment ? recordedBrief : brief)}><Camera size={18} /> {status === 'requesting' ? 'Opening camera…' : status === 'finishing' ? 'Preparing review…' : status === 'review' ? experiment ? 'Record another take' : 'Record another session' : 'Start video practice'}</button>}
          {url && <a href={url} download={`speaknow-expression.${run.current.recorder?.mimeType.includes('mp4') ? 'mp4' : 'webm'}`}><Download size={17} /> Save video</a>}
        </div>
        {!normalizeBrief(experiment ? recordedBrief : brief) && <p className="expression-small">Add your listener goal above to start recording.</p>}
        <div className="expression-video"><video ref={video} src={url || undefined} playsInline controls={status === 'review'} muted={status !== 'review'} aria-label="Your practice video" onTimeUpdate={checkPlaybackRange} onSeeked={checkPlaybackRange} onPlay={e => { document.querySelectorAll('video').forEach(v => { if (v !== e.currentTarget) v.pause(); }); }} onPause={() => { playbackRange.current = null; setPlayingClip(null); }} />
          {status === 'idle' && <div className="expression-empty"><Camera size={32} /><p>A little room to be yourself.</p></div>}
          {status === 'recording' && <span className="expression-recording">Recording · {clock(seconds)} / 2:00</span>}
        </div>
        {status === 'review' && reviewingClip !== null && <button className="expression-secondary expression-return" onClick={() => {
          video.current?.pause();
          const target = document.getElementById(`expression-clip-${reviewingClip}`);
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ behavior: 'auto', block: 'start' });
        }}><ArrowLeft size={16} /> Back to this moment</button>}
        {experiment && status === 'review' && !experiment.intention.trim() && <p className="expression-small">Set your intention in the experiment below before recording another take.</p>}
        {status === 'recording' && <p aria-live="polite">{vision === 'ready' ? 'Observing visible movement on this device.' : vision === 'loading' ? 'Loading movement observation… recording continues.' : 'Movement observation unavailable. Recording continues for your own review.'}<br />{liveText || 'Speak naturally. There is no ideal gesture to perform.'}</p>}
        <p className="expression-small">Video stays in this tab. An active experiment preserves its original video for comparison; other recordings are replaced when you start again. Leaving removes unsaved videos. Browser transcription may use your browser provider’s speech service. Transcript timing is approximate.</p>
        {notice && status !== 'review' && <p role="status" className="expression-notice">{notice}</p>}
      </section>
      {status !== 'recording' && <aside className="expression-panel"><p className="expression-eyebrow">YOUR EXPRESSION NOTEBOOK</p><h2>Your confirmed patterns</h2><p>{new Set(history.filter(h => h.decision === 'habit').map(h => h.sessionId)).size} sessions saved.</p><p>确认“这很像我”，系统才会把动作加入你的个人模式。</p><details className="expression-evidence"><summary>识别范围</summary><p className="expression-small">动作测量只描述头部、眼睛、肩膀和手的变化，不判断情绪、注意力或意图。光线和镜头位置会影响结果。</p></details>
        <div className="expression-patterns"><h3>Patterns for this situation</h3>{patterns.length ? patterns.map(p => <p key={`${p.context}-${p.key}`}>{p.label}</p>) : <p>No recurring pattern for this situation yet. Confirm examples across separate sessions with a similar goal and camera setup.</p>}</div>
        {history.some(h => h.featureVersion !== FEATURE_VERSION) && <p className="expression-small">Earlier examples are preserved. The updated movement measurements start a separate comparison baseline.</p>}
        <button className="expression-secondary" disabled={!history.length} onClick={() => { try { localStorage.removeItem(key); setHistory([]); setClips(current => current.map(c => ({ ...c, decision: '' }))); } catch { setNotice('Could not delete the saved notebook.'); } }}><Trash2 size={16} /> Clear notebook</button>
      </aside>}
    </div>
    {experiment && <div id="expression-experiment" tabIndex={-1}><ExpressionPracticeLab key={experiment.id} experiment={experiment} clips={clips} currentUrl={url} status={status}
      onUpdate={patch => { setExperiment(current => ({ ...current, ...patch })); setExperimentSaved(false); }}
      onRecord={() => { video.current?.scrollIntoView({ behavior: 'auto', block: 'center' }); void start(); }}
      onEditTranscript={(id, text) => updateClip(id, { text, decision: '' })}
      onFinish={finishExperiment} onClose={closeExperiment} saved={experimentSaved} onDirty={() => setExperimentSaved(false)} /></div>}
    {status === 'review' && <section id="expression-review" className="expression-review" tabIndex={-1}><h2>Your result</h2><div className="expression-verdict"><p className="expression-eyebrow">DIRECT JUDGMENT</p><h3>{verdict.title}</h3><p>{verdict.action}</p></div>
      {activeBrief && <div className="expression-goal-review"><p className="expression-eyebrow">YOUR INTENTION</p><p>{activeBrief.goal}</p><p className="expression-small">{focusQuestion(activeBrief)}</p></div>}
      <div className="expression-summary" aria-label="Session overview">
        <div><strong>{clock(clips.reduce((end, c) => Math.max(end, c.end), 0))}</strong><span>Recorded</span></div>
        <div><strong>{clips.length}</strong><span>Review moments</span></div>
        <div><strong>{usable.length}<small> / {clips.length}</small></strong><span>With visual evidence</span></div>
        <div><strong>{confirmed}</strong><span>Confirmed examples</span></div>
      </div>
      <p className="expression-next-step">下一步：{verdict.action}</p>
      {notice && <p role="status" className="expression-notice">{notice}</p>}
      <button className="expression-secondary" disabled={notesBusy || !clips.some(c => c.text.trim())} onClick={requestNotes}>{notesBusy ? 'Preparing questions…' : '生成针对性追问'}</button><details className="expression-evidence"><summary>分析依据与隐私</summary><p className="expression-small">只发送场景、目标、文字和动作测量，不发送视频。动作结论需要你确认。</p></details>
      {!clips.some(c => c.text.trim()) && <p className="expression-small">Add your words to a moment below to unlock reflection questions and speaking practice.</p>}
      {modelUsed?.provider && <p className="expression-small">Reflection questions generated by {modelUsed.provider}{modelUsed.model ? ` · ${modelUsed.model}` : ''}. Movement measurements are computed on your device.</p>}
      {notesNotice && <p className="expression-notice" role="status">{notesNotice}</p>}
      <div className="expression-filters" role="group" aria-label="Filter review moments">{filters.map(filter => <button key={filter.id} className="expression-secondary" aria-pressed={reviewFilter === filter.id} onClick={() => { setReviewFilter(filter.id); setShowAll(false); }}>{filter.label}<span>{filter.count}</span></button>)}</div>
      <p className="expression-small" role="status">Showing {visibleClips.length} of {filtered.length} moments · priority order</p>
      {!filtered.length && <div className="expression-review-empty"><h3>{reviewFilter === 'pending' ? 'Every moment has been reviewed.' : 'No moments here yet.'}</h3><p>{reviewFilter === 'habit' ? 'Choose a context and confirm a familiar movement to save your first example.' : 'Select All moments to continue exploring this recording.'}</p><button className="expression-secondary" onClick={() => setReviewFilter('all')}>View all moments</button></div>}
      <div className="expression-clips">{visibleClips.map(clip => <article key={clip.id} id={`expression-clip-${clip.id}`} tabIndex={-1} className="expression-panel">
        <p className="expression-eyebrow">{clip.reviewLabel}</p>
        <button className="expression-secondary" aria-pressed={playingClip === clip.id} onClick={() => playingClip === clip.id ? video.current?.pause() : replayClip(clip)}>{playingClip === clip.id ? <Square size={16} /> : <Play size={16} />} {playingClip === clip.id ? 'Pause' : 'Replay'} {clock(clip.start)}–{clock(clip.end)}</button>
        <p className="expression-small">{clip.coverage >= 0.5 && Object.keys(clip.metrics).length ? 'Visual evidence available · observations are approximate' : 'Limited visual evidence · manual review only'}</p>
        <p>{clip.reason}</p><div className="expression-tags">{Object.keys(clip.metrics).map(k => <span key={k}>{EXPRESSION_METRICS[k]}</span>)}</div>
        {!experiment && <button className="practice-launch" disabled={!clip.text.trim()} onClick={() => beginExperiment(clip)}>Practise this moment →</button>}
        {!experiment && !clip.text.trim() && <p className="expression-small">Add what you said below to practise this moment.</p>}
        {clip.events?.map(e => <p className="expression-small" key={e.key}>{e.label} · {e.reversals} direction changes · tentative</p>)}
        <label>What you said<textarea value={clip.text} maxLength={1200} onChange={e => updateClip(clip.id, { text: e.target.value, note: '', decision: '' })} placeholder="Add or correct your words…" /></label>
        <label>What you meant<select value={clip.context} onChange={e => updateClip(clip.id, { context: e.target.value, decision: '' })}><option value="">Choose a context</option>{contexts.map(c => <option key={c}>{c}</option>)}</select></label>
        {!clip.context && contexts.includes(clip.suggestedContext) && <div className="expression-suggestion"><p>Suggested from your words: {clip.suggestedContext}<br />“{clip.quote}”</p><button className="expression-secondary" onClick={() => updateClip(clip.id, { context: clip.suggestedContext, decision: '' })}>Confirm this meaning</button></div>}
        <details className="expression-evidence"><summary>Why this observation?</summary><p className="expression-small">About {Math.round(clip.coverage * 100)}% of expected frames captured. {Object.keys(clip.metrics).length} movement measurements have enough visibility. This is recording coverage, not certainty about meaning.</p><p className="expression-small">Comparison: your earlier confirmed examples in this scene, audience category, focus, position and meaning. This recording is excluded from its own baseline.</p><p className="expression-small">{focusQuestion(clip.brief)} No score is assigned to your movement.</p></details>
        <label>How did this movement affect your message?<select value={clip.perceivedEffect || ''} onChange={e => updateClip(clip.id, { perceivedEffect: e.target.value, decision: '' })}><option value="">Your own impression (optional)</option><option value="supports">It helped my meaning</option><option value="interferes">It got in the way</option><option value="unsure">I am not sure yet</option></select></label>
        <label>Your interpretation (optional)<textarea value={clip.personalNote || ''} maxLength={400} onChange={e => updateClip(clip.id, { personalNote: e.target.value, decision: '' })} placeholder="For example: I often move my head like this when agreeing." /></label>
        <p className="expression-comparison">{compareWithHistory(clip, history.filter(h => h.sessionId !== run.current.id))}</p>
        {clip.note && <p className="expression-question">AI Coaching Suggestion · 模型追问，非已确认结论：{clip.note}</p>}
        <div className="expression-actions"><button disabled={!clip.context || !Object.keys(clip.metrics).length || clip.coverage < 0.5} aria-pressed={clip.decision === 'habit'} onClick={() => remember(clip, 'habit')}>This feels like me</button><button className="expression-secondary" aria-pressed={clip.decision === 'rejected'} onClick={() => remember(clip, 'rejected')}>Observation is inaccurate</button></div>
        {!clip.decision && <p className="expression-small">{clip.coverage < 0.5 || !Object.keys(clip.metrics).length ? 'This moment cannot be saved as a movement habit because visual evidence is limited. You can still review your words and practise.' : !clip.context ? 'Choose what you meant to enable saving this example.' : 'Confirm only if this movement feels familiar to you.'}</p>}
        {clip.decision && <p className="expression-small" role="status">{clip.decision === 'habit' ? 'Saved as your confirmed example.' : 'Excluded from your personal pattern.'}</p>}
      </article>)}</div>
      {filtered.length > 4 && <button className="expression-secondary expression-show-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show 4 priority moments' : `Show all ${filtered.length} moments`}</button>}
    </section>}
    <PracticeOverview records={practiceRecords} onDelete={id => {
      const next = practiceRecords.filter(r => r.id !== id);
      try { localStorage.setItem(practiceKey, JSON.stringify(next)); setPracticeRecords(next); if (experiment?.id === id) setExperimentSaved(false); }
      catch { setNotice('Could not delete this reflection. Please try again.'); }
    }} />
  </main>;
}
