import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import VoiceOrb from '@/components/spatial/VoiceOrb';
import { VoiceCapture } from '@/lib/voice/VoiceCapture';
import { savePractice, saveRecording } from './storage';
import { readDraft, writeDraft, removeDraft } from './drafts';

export default function PresentationCapture({ context, retry, attemptId, userId, fileName, pageTimings, totalPages, onSaved, onExit }) {
  const capture = useRef(null), energy = useRef(null), recorder = useRef(null), media = useRef(null), mounted = useRef(true);
  const finishedRecording = useRef(Promise.resolve()), recordStarted = useRef(0), generation = useRef(0), busy = useRef(false);
  const work = useRef({ text: '', inputSource: 'typed', elapsed: 0, blob: null, savedSession: null });
  const completed = useRef(false);
  const writeQueue = useRef(Promise.resolve()), timer = useRef(null), restored = useRef(false);
  const [phase, setPhase] = useState('idle'), [text, setText] = useState(''), [source, setSource] = useState('typed'), [error, setError] = useState(''), [elapsed, setElapsed] = useState(0);
  const [loadingDraft, setLoadingDraft] = useState(true), [savedPractice, setSavedPractice] = useState(null), [draftWarning, setDraftWarning] = useState('');
  const persist = useCallback(() => {
    const value = { ...work.current };
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => writeDraft(userId, attemptId, value));
    return writeQueue.current;
  }, [userId, attemptId]);
  const scheduleSave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist().catch(err => { if (mounted.current) setDraftWarning(err.message); }); }, 200);
  }, [persist]);
  const stopMedia = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    media.current?.getTracks().forEach(track => track.stop()); media.current = null;
  }, []);
  useEffect(() => {
    let active = true;
    readDraft(userId, attemptId).then(value => {
      if (!active) return;
      if (value) {
        work.current = { text: value.text || '', inputSource: value.inputSource || 'typed', elapsed: value.elapsed || 0, blob: value.blob || null, savedSession: value.savedSession || null };
        setText(work.current.text); setSource(work.current.inputSource); setElapsed(work.current.elapsed); setSavedPractice(work.current.savedSession);
      }
    }).catch(err => { if (active) setDraftWarning(err.message); }).finally(() => { if (active) { restored.current = true; setLoadingDraft(false); } });
    return () => { active = false; };
  }, [userId, attemptId]);
  useEffect(() => {
    mounted.current = true;
    const instance = new VoiceCapture({ maxRecordingMs: 600000, retainStream: true, onEvent(event) {
      if (!mounted.current) return;
      if (event.type === 'stream') {
        media.current = event.stream;
        const chunks = [], own = generation.current;
        let settle = () => {}, failed = false;
        try {
          const rec = new MediaRecorder(event.stream); recorder.current = rec;
          finishedRecording.current = new Promise(resolve => { settle = resolve; });
          rec.onstart = () => { recordStarted.current = performance.now(); };
          rec.ondataavailable = value => { if (value.data.size) chunks.push(value.data); };
          rec.onstop = () => {
            if (!failed && own === generation.current) {
              work.current.blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
              work.current.elapsed = Math.max(0, Math.round((performance.now() - recordStarted.current) / 1000));
              if (mounted.current) setElapsed(work.current.elapsed);
              void persist().catch(err => { if (mounted.current) setDraftWarning(err.message); });
            }
            settle();
          };
          rec.onerror = () => { failed = true; settle(); if (mounted.current) setError('Recording failed. Your transcript remains available.'); };
          rec.start();
        } catch {
          failed = true; settle(); recorder.current = null;
          setError('Audio replay is unavailable. Text practice remains available, but cannot establish spoken improvement.');
        }
      }
      if (event.type === 'energy') energy.current = event.meter;
      if (event.type === 'phase') setPhase(event.phase);
      if (event.type === 'transcript') {
        work.current.text = [event.final, event.interim].filter(Boolean).join(' '); work.current.inputSource = 'transcribed';
        setText(work.current.text); setSource('transcribed'); scheduleSave();
      }
      if (event.type === 'stopped') { work.current.text = event.text; setText(event.text); setPhase('idle'); stopMedia(); scheduleSave(); }
      if (event.type === 'error') { setError(event.message); setPhase('error'); stopMedia(); }
    } });
    capture.current = instance;
    return () => { mounted.current = false; clearTimeout(timer.current); instance.dispose(); stopMedia(); if (restored.current && !completed.current) void persist().catch(() => {}); };
  }, [persist, scheduleSave, stopMedia]);
  useEffect(() => {
    if (phase !== 'listening') return undefined;
    const interval = setInterval(() => { if (recordStarted.current) setElapsed(Math.max(0, Math.floor((performance.now() - recordStarted.current) / 1000))); }, 1000);
    return () => clearInterval(interval);
  }, [phase]);
  async function start() {
    if (busy.current || loadingDraft || work.current.savedSession || ['listening', 'starting', 'requesting_permission', 'stopping', 'processing'].includes(phase)) return;
    busy.current = true;
    try {
      await finishedRecording.current;
      if (!mounted.current) return;
      generation.current++; recordStarted.current = 0;
      work.current = { text: '', inputSource: 'transcribed', elapsed: 0, blob: null, savedSession: null };
      setText(''); setSource('transcribed'); setElapsed(0); setError(''); setPhase('requesting_permission');
      if (!await capture.current.start()) { stopMedia(); if (mounted.current) setPhase('error'); }
    } catch (err) { stopMedia(); if (mounted.current) { setError(err.message || 'Microphone could not start.'); setPhase('error'); } }
    finally { busy.current = false; }
  }
  async function stop() { await capture.current.stop(); stopMedia(); await finishedRecording.current; if (mounted.current) setPhase('idle'); }
  async function exit() {
    if (phase === 'processing') return;
    await stop();
    try { await persist(); onExit?.(); }
    catch (err) { setDraftWarning(`${err.message} Copy the words before leaving, or finish saving the practice.`); }
  }
  function cancel() { generation.current++; capture.current.cancel(); stopMedia(); work.current.blob = null; setPhase('idle'); setError('Recording cancelled. Your words are kept for review.'); scheduleSave(); }
  async function finish() {
    if (busy.current || loadingDraft || !work.current.text.trim()) return;
    busy.current = true; setError('');
    try {
      await stop(); if (!mounted.current) return; setPhase('processing');
      const session = work.current.savedSession || await savePractice({ id: attemptId, transcript: work.current.text.trim(), context, inputSource: work.current.inputSource, duration: work.current.elapsed, fileName, totalPages, pageTimings, ...(retry?.parentPracticeId ? { parentPracticeId: retry.parentPracticeId, kind: retry.kind, targetId: retry.targetId } : {}) });
      work.current.savedSession = session; setSavedPractice(session);
      await persist().catch(err => setDraftWarning(err.message));
      if (work.current.blob?.size) await saveRecording(session.id, work.current.blob, attemptId);
      // All pending writes settle before deletion, including the MediaRecorder onstop write.
      clearTimeout(timer.current); completed.current = true;
      await writeQueue.current.catch(() => {}); await removeDraft(userId, attemptId).catch(() => {});
      if (mounted.current) onSaved(session);
    } catch (err) {
      if (mounted.current) {
        setError(`${err.message} ${work.current.savedSession ? 'The transcript is saved; recording upload is pending. Retry Finish to complete it.' : 'Your words and any recording remain on this device. Retry Finish when connected.'}`);
        setPhase('error'); scheduleSave();
      }
    } finally { busy.current = false; }
  }
  const orbState = ['stopping', 'processing', 'finalizing'].includes(phase) ? 'processing' : phase === 'listening' ? 'listening' : phase === 'error' ? 'error' : 'idle';
  return <section className="impact-capture glass rounded-2xl p-5" data-owner={userId}>
    <VoiceOrb state={orbState} energyRef={energy} />
    <h2>{retry?.kind === 'moment' ? 'Practice This Moment' : 'Record your first attempt'}</h2>
    <p>{retry?.target?.practiceObjective || 'Explain your core message to your intended audience in about five minutes.'}</p>
    <p>{context.coreMessage}</p>
    <p role="status">{loadingDraft ? 'Restoring unsent work' : phase === 'listening' ? 'Listening to you' : phase === 'processing' ? 'Saving your practice' : 'Review your words, then finish'} · recorded duration: {elapsed}s</p>
    <p className="text-sm text-muted-foreground">Recording duration is browser timing. Recognized words need checking against the recording; they are not a pronunciation assessment.</p>
    <label className="impact-field"><span>{source === 'typed' ? 'Typed practice text' : 'Recognized transcript · review for errors'}</span><textarea rows={5} value={text} disabled={loadingDraft} readOnly={['listening', 'starting', 'requesting_permission', 'stopping', 'finalizing', 'processing'].includes(phase) || Boolean(savedPractice)} onChange={event => {
      work.current.text = event.target.value;
      work.current.inputSource = work.current.blob ? 'mixed' : 'typed';
      setText(work.current.text); setSource(work.current.inputSource); scheduleSave();
    }} /></label>
    <div className="impact-actions">
      <Button type="button" disabled={loadingDraft || busy.current || Boolean(savedPractice) || ['processing', 'stopping', 'finalizing'].includes(phase)} onClick={phase === 'listening' ? stop : start}>{phase === 'listening' ? 'Stop Recording' : 'Start Recording'}</Button>
      <Button type="button" variant="outline" disabled={loadingDraft || phase === 'processing' || Boolean(savedPractice)} onClick={() => { cancel(); work.current.inputSource = 'typed'; setSource('typed'); setError(''); }}>Use Text Mode</Button>
      <Button type="button" variant="outline" disabled={loadingDraft || phase === 'processing' || Boolean(savedPractice)} onClick={cancel}>Cancel Recording</Button>
      <Button type="button" disabled={loadingDraft || !text.trim() || ['requesting_permission', 'starting', 'stopping', 'finalizing', 'processing'].includes(phase)} onClick={finish}>{phase === 'processing' ? 'Saving…' : retry?.kind === 'moment' ? 'Finish & Compare' : 'Finish Presentation'}</Button>
      <Button type="button" variant="outline" disabled={loadingDraft || phase === 'processing'} onClick={exit}>Exit · keep draft</Button>
    </div>
    {source !== 'transcribed' && <p className="text-sm text-muted-foreground">Text-only or edited text supports content coaching; it does not prove what was spoken or whether spoken delivery improved.</p>}
    {draftWarning && <p role="status">{draftWarning}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
