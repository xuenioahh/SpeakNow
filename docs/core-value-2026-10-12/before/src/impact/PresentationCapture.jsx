import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import VoiceOrb from '@/components/spatial/VoiceOrb';
import { VoiceCapture } from '@/lib/voice/VoiceCapture';
import { savePractice, saveRecording } from './storage';

// Presentation uses the established voice controller and Orb; no second ASR/state engine.
export default function PresentationCapture({ context, retry, userId, fileName, pageTimings, totalPages, onSaved }) {
  const capture = useRef(null), energy = useRef(null), recorder = useRef(null), media = useRef(null), mounted = useRef(true);
  const finishedRecording = useRef(Promise.resolve()), resolveRecording = useRef(null), blob = useRef(null);
  const generation = useRef(0), id = useRef(crypto.randomUUID()), started = useRef(0), lastText = useRef('');
  const busy = useRef(false);
  const [phase, setPhase] = useState('idle'), [text, setText] = useState(''), [source, setSource] = useState('transcribed'), [error, setError] = useState(''), [elapsed, setElapsed] = useState(0);
  const [savedPractice, setSavedPractice] = useState(null);
  const stopMedia = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    media.current?.getTracks().forEach(track => track.stop()); media.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const instance = new VoiceCapture({ maxRecordingMs: 600000, retainStream: true, onEvent(event) {
      if (!mounted.current) return;
      if (event.type === 'stream') {
        media.current = event.stream;
        const recorded = [], own = generation.current;
        try {
          const rec = new MediaRecorder(event.stream); recorder.current = rec;
          finishedRecording.current = new Promise(resolve => { resolveRecording.current = resolve; });
          rec.ondataavailable = value => { if (value.data.size) recorded.push(value.data); };
          rec.onstop = () => { if (mounted.current && own === generation.current) blob.current = new Blob(recorded, { type: rec.mimeType || 'audio/webm' }); resolveRecording.current?.(); };
          rec.onerror = () => { resolveRecording.current?.(); if (mounted.current) setError('Recording failed. Review your transcript or retry.'); };
          rec.start();
        } catch { setError('Audio replay is unavailable in this browser; transcript practice remains available.'); }
      }
      if (event.type === 'energy') energy.current = event.meter;
      if (event.type === 'phase') setPhase(event.phase);
      if (event.type === 'transcript') { const value = [event.final, event.interim].filter(Boolean).join(' '); lastText.current = value; setText(value); }
      if (event.type === 'stopped') { lastText.current = event.text; setText(event.text); setPhase('idle'); stopMedia(); }
      if (event.type === 'error') { setError(event.message); setPhase('error'); stopMedia(); }
    } });
    capture.current = instance;
    return () => { mounted.current = false; generation.current++; instance.dispose(); stopMedia(); };
  }, [stopMedia]);
  useEffect(() => { if (phase !== 'listening') return undefined; const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(timer); }, [phase]);
  async function start() {
    if (busy.current || ['listening', 'starting', 'requesting_permission', 'stopping', 'processing'].includes(phase) || savedPractice) return;
    busy.current = true; ++generation.current;
    setError(''); setText(''); lastText.current = ''; blob.current = null; setSource('transcribed'); setElapsed(0); started.current = Date.now();
    try {
      await finishedRecording.current;
      if (!mounted.current) return;
      if (!await capture.current.start()) { stopMedia(); setPhase('error'); }
    } catch (err) { stopMedia(); if (mounted.current) { setError(err.message || 'Microphone could not start.'); setPhase('error'); } }
    finally { busy.current = false; }
  }
  async function stop() { await capture.current.stop(); stopMedia(); await finishedRecording.current; if (mounted.current) setPhase('idle'); }
  function cancel() { generation.current++; capture.current.cancel(); stopMedia(); blob.current = null; id.current = crypto.randomUUID(); setPhase('idle'); setError('Capture cancelled. Nothing was saved.'); }
  async function finish() {
    if (busy.current || !lastText.current.trim()) return;
    busy.current = true; setError('');
    try {
      await stop(); setPhase('processing');
      const value = lastText.current.trim();
      const session = savedPractice || await savePractice({ id: id.current, transcript: value, context, inputSource: source, duration: elapsed, fileName, totalPages, pageTimings, ...(retry?.parentPracticeId ? { parentPracticeId: retry.parentPracticeId, kind: retry.kind, targetId: retry.targetId } : {}) });
      setSavedPractice(session);
      // Upload belongs to this exact immutable practice; a retry never replaces before audio.
      if (blob.current?.size) await saveRecording(session.id, blob.current);
      if (mounted.current) onSaved(session);
    } catch (err) { if (mounted.current) { setError(`${err.message} ${savedPractice ? 'The transcript is saved. Retry Finish to save the recording.' : 'Nothing has been discarded.'}`); setPhase('error'); } }
    finally { busy.current = false; }
  }
  const orbState = ['stopping', 'processing', 'finalizing'].includes(phase) ? 'processing' : phase === 'listening' ? 'listening' : phase === 'error' ? 'error' : 'idle';
  return <section className="impact-capture glass rounded-2xl p-5" data-owner={userId}>
    <VoiceOrb state={orbState} energyRef={energy} />
    <h2>{retry?.kind === 'moment' ? 'Practice This Moment' : 'SpeakNow Impact Studio'}</h2>
    <p>{retry?.target?.practiceObjective || context.coreMessage}</p>
    <p role="status">{phase === 'listening' ? 'Listening to you' : phase === 'processing' ? 'Saving your practice' : 'Record or type, review the actual words, then finish.'} · {elapsed}s</p>
    <label className="impact-field"><span>{source === 'typed' ? 'Typed practice text' : 'Practice transcript'}</span><textarea rows={5} value={text} readOnly={phase === 'listening' || Boolean(savedPractice)} onChange={event => { setText(event.target.value); lastText.current = event.target.value; setSource(source === 'typed' ? 'typed' : 'mixed'); }} /></label>
    <div className="impact-actions">
      <Button type="button" disabled={busy.current || Boolean(savedPractice) || phase === 'processing'} onClick={phase === 'listening' ? stop : start}>{phase === 'listening' ? 'Stop Recording' : 'Start Recording'}</Button>
      <Button type="button" variant="outline" disabled={phase === 'processing' || Boolean(savedPractice)} onClick={() => { cancel(); setError(''); setSource('typed'); }}>Use Text Mode</Button>
      <Button type="button" variant="outline" disabled={phase === 'processing' || Boolean(savedPractice)} onClick={cancel}>Cancel Recording</Button>
      <Button type="button" disabled={!text.trim() || ['requesting_permission', 'starting', 'processing'].includes(phase)} onClick={finish}>{phase === 'processing' ? 'Saving…' : retry?.kind === 'moment' ? 'Finish & Compare' : 'Finish Presentation'}</Button>
    </div>
    {source !== 'transcribed' && <p className="text-sm text-muted-foreground">Feedback evaluates supplied text. Typed or edited words are not proof of what was spoken.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
