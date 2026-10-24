import { Mic, Send, RotateCcw, Square, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function RecordingControls({ interaction, state, replyInputRef = null, compact = false }) {
  const starting = ['requesting_permission', 'starting'].includes(state.status);
  const finishing = ['stopping', 'finalizing'].includes(state.status);
  const busy = ['submitting', 'processing'].includes(state.status) || finishing;
  const recording = state.recordingSession || starting;
  const hasWords = Boolean((state.typedText || (!state.interimText ? state.finalText : '')).trim());
  const statusText = {
    requesting_permission: 'Allow microphone access when your browser asks.',
    starting: 'Starting voice input…',
    listening: 'Listening. Take your time; tap stop to finish and send.',
    stopping: 'Stopping the microphone…',
    finalizing: 'Waiting for the final recognized words…',
    submitting: 'Sending your confirmed reply…',
    processing: 'Your coach is responding. You can cancel this request.',
    speaking: 'Your coach is speaking. Recording will stop playback.',
    completed: 'Practice complete.',
  }[state.status];
  return <div className="voice-recording-panel glass border-t border-white/5 px-4 py-3 space-y-2">
    {!compact && <div className="voice-input-status" aria-live="polite">
      {state.status === 'error' ? <AlertCircle className="h-4 w-4 text-amber-300" /> : state.inputActive ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Mic className="h-4 w-4 text-primary" />}
      <span>{state.error || statusText || state.notice || 'Speak or type your reply. Your words remain available if a request fails.'}</span>
    </div>}
    {compact && state.notice && <p className="text-xs text-muted-foreground" role="status">{state.notice}</p>}
    {state.draftStorageUnavailable && <p className="text-xs text-amber-200">Your browser cannot save an unsent draft. Your words remain here; copy them before leaving.</p>}
    <div className="flex items-center gap-2">
      <Input ref={replyInputRef} aria-label="Your reply" value={state.typedText} onChange={event => interaction.setTypedText(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing && !busy && !starting) { event.preventDefault(); void interaction.send(); }
      }} placeholder="Type or review your reply" disabled={busy || starting} className="h-11 rounded-2xl border-white/10 bg-white/5 text-foreground placeholder:text-muted-foreground" />
      <button type="button" aria-label="Send reply" onClick={() => void interaction.send()} disabled={busy || starting || !hasWords} className="h-11 w-11 flex-shrink-0 rounded-2xl glass hover:bg-white/10 disabled:opacity-30 transition-all flex items-center justify-center"><Send className="w-5 h-5 text-primary" /></button>
    </div>
    {(!compact || recording || state.finalText || state.interimText) && <div className="voice-live-transcript glass rounded-xl px-3 py-2" aria-label="Live transcription">
      <p className="voice-transcript-label">{recording ? 'YOU · LIVE TRANSCRIPT' : 'YOUR TRANSCRIPT'}</p>
      <p className="text-sm leading-relaxed"><span className="voice-final-words">{state.finalText}</span>{state.finalText && state.interimText ? ' ' : ''}<span className="voice-interim-words">{state.interimText}</span>{!state.finalText && !state.interimText && <span className="text-muted-foreground">{recording ? 'Listening for your words…' : 'Confirmed words appear here while you speak.'}</span>}</p>
      {state.interimText && <p className="voice-transcript-label">Lighter words are still being recognized.</p>}
    </div>}
    <details><summary className="text-sm text-muted-foreground">Voice settings</summary><div className="voice-input-options">
      <label><input type="checkbox" checked={state.autoEnd} disabled={!state.energyAvailable && !state.autoEnd || busy} onChange={event => interaction.configure({ autoEnd: event.target.checked })} /> End after a speaking pause</label>
      {state.autoEnd && <label>Pause <select value={state.silenceMs} disabled={busy} onChange={event => interaction.configure({ silenceMs: Number(event.target.value) })}><option value={1800}>1.8 seconds</option><option value={2500}>2.5 seconds</option><option value={3500}>3.5 seconds</option></select></label>}
      <label><input type="checkbox" checked={state.autoPlay} onChange={event => interaction.configure({ autoPlay: event.target.checked })} /> Read coach replies aloud</label>
    </div></details>
    {!state.energyAvailable && state.inputActive && <p className="text-xs text-muted-foreground">Automatic pause detection is unavailable in this browser. Tap stop when you finish.</p>}
    <div className="flex items-center justify-center gap-6">
      <button type="button" aria-label="Record again" onClick={() => void interaction.startRecording({ restart: true })} disabled={busy || starting || (!recording && !state.finalText && !state.interimText && !state.typedText)} className="p-3 rounded-full glass hover:bg-white/10 disabled:opacity-30"><RotateCcw className="w-5 h-5 text-muted-foreground" /></button>
      <button type="button" aria-label={starting && !state.recordingSession ? 'Cancel microphone startup' : recording ? 'Stop recording and send' : 'Start recording'} aria-pressed={state.inputActive} onClick={() => starting && !state.recordingSession ? interaction.cancelRecording() : recording ? void interaction.stopRecording() : void interaction.startRecording()} disabled={busy || state.status === 'completed'} className={`p-5 rounded-full transition-all ${recording ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-primary shadow-lg shadow-primary/30'} disabled:opacity-50`}>
        {busy || starting ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : recording ? <Square className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
      </button>
      <div className="w-11" />
    </div>
    {state.status === 'processing' && <button type="button" className="voice-recovery-button" onClick={() => interaction.cancelRequest()}>Cancel request · keep my reply</button>}
    {state.retryable && <button type="button" className="voice-recovery-button" onClick={() => interaction.retryRequest()} disabled={recording || busy}>Retry this request</button>}
  </div>;
}
