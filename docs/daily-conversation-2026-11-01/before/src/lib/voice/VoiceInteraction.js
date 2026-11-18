import { AudioTake } from './AudioTake.js';
import { VoiceCapture } from './VoiceCapture.js';

const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One external store owns interaction state. UI and the orb only consume it.
export class VoiceInteraction {
  /** @param {{ request?: (text: string, options: {signal: AbortSignal, turnId: string, history: any[], onDelta?: (text: string) => void}) => Promise<any>, audio?: any, voiceGender?: string, aiRole?: string, visualFor?: (text: string) => any, initialMessage?: any, environment?: any, now?: () => number, requestTimeoutMs?: number, captureOptions?: any, initialDraft?: string, saveDraft?: (text: string) => void, saveRecording?: (recording: any) => Promise<any>, initialMessages?: any[], initialRecordingId?: string }} options */
  constructor({ request, audio, voiceGender = 'female', aiRole = 'Coach', visualFor = (_text) => null, initialMessage, environment = globalThis, now = () => performance.now(), requestTimeoutMs = 45000, captureOptions = {}, initialDraft = '', saveDraft = (_text) => {}, saveRecording, initialMessages, initialRecordingId } = {}) {
    this.request = request; this.audio = audio; this.voiceGender = voiceGender;
    this.aiRole = aiRole; this.visualFor = visualFor; this.env = environment; this.now = now;
    this.requestTimeoutMs = requestTimeoutMs; this.saveDraft = saveDraft;
    this.audioTake = saveRecording ? new AudioTake({onSave:saveRecording,onError:message=>this.update({notice:message})}) : null;
    if(this.audioTake && initialRecordingId){this.audioTake.id=initialRecordingId;this.audioTake.done=Promise.resolve(initialRecordingId);}
    this.listeners = new Set(); this.sequence = Math.max(initialMessages?.filter(message=>message.role==='user').length||0,...(initialMessages||[]).map(message=>Number(/turn-(\d+)/.exec(message.turnId||message.id||'')?.[1]||0))); this.started = false; this.playGeneration = 0; this.disposed = false;
    this.sessionId = null;
    this.startedAt = Date.now();this.savedAnalysis = null;
    this.energyRef = { current: null };
    this.snapshot = { status: 'idle', inputActive: false, recordingSession: false, finalText: '', interimText: '', typedText: initialDraft,
      messages: initialMessages?.length ? initialMessages : initialMessage ? [initialMessage] : [], activePlaybackId: null, speechText: '', voiceSource: null, energyAvailable: false,
      autoEnd: false, silenceMs: 1800, autoPlay: true, continuous: false, streamingText: '', error: null, retryable: false,
      draftStorageUnavailable: false, notice: initialDraft ? 'Recovered unsent words from this tab. Review and send, or record again.' : '', timings: [] };
    this.capture = new VoiceCapture({ retainStream:Boolean(saveRecording), ...captureOptions, environment, now, onEvent: event => this.captureEvent(event) });
    const previous=this.snapshot.messages.at(-1);
    if(previous?.role==='user'){
      const id=previous.turnId||String(previous.id||`user-turn-${this.sequence}`).replace(/^user-/,'');
      this.failedTurn={id,user:previous,history:[...this.snapshot.messages],continuous:false,metrics:{turnId:id,t3:null,t4:null,t5:null}};
      this.snapshot={...this.snapshot,retryable:true,error:'Your previous reply is saved. Retry the AI request or continue the conversation.'};
    }
  }
  getSnapshot = () => this.snapshot;
  subscribe = listener => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(patch) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  persistDraft() {
    try {
      this.saveDraft(clean(this.snapshot.typedText || [this.snapshot.finalText, this.snapshot.interimText].filter(Boolean).join(' ') || this.pending?.user.content || this.failedTurn?.user.content || this.previousDraft));
      if (this.snapshot.draftStorageUnavailable) this.update({ draftStorageUnavailable: false });
    } catch { this.update({ draftStorageUnavailable: true }); }
  }
  activate() {
    if (this.unsubscribeAudio) return;
    this.unsubscribeAudio = this.audio?.subscribe?.(event => this.playbackEvent(event));
    this.deviceChanged = () => {
      if (this.capture.active || this.capture.starting) this.capture.fail('Audio devices changed. Your transcript is kept. Select your microphone in browser settings, then record again.');
    };
    this.offline = () => { if (this.pending) this.failTurn(this.pending, 'You are offline. Your reply is kept. Reconnect and retry the request.'); };
    this.env.navigator?.mediaDevices?.addEventListener?.('devicechange', this.deviceChanged);
    this.env.window?.addEventListener?.('offline', this.offline);
    this.pagehide = () => {
      this.update({ continuous: false });
      this.cancelRequest(); this.stopPlayback(); this.capture.cancel();
      this.completionCancelled = true;
      this.update({ status: 'idle', inputActive: false, recordingSession: false, notice: 'Your unsent words are kept in this tab. Record again or review and send.' });
      this.persistDraft();
    };
    this.env.window?.addEventListener?.('pagehide', this.pagehide);
  }
  captureEvent(event) {
    if (this.disposed) return;
    if (event.type === 'stream') { this.captureStartedAt = Date.now(); this.audioTake?.start(event.stream); }
    if (event.type === 'energy' && !event.meter) void this.audioTake?.stop();
    if (event.type === 'phase') this.update({ status: event.phase, inputActive: event.phase === 'listening', recordingSession: event.phase === 'listening' || this.snapshot.recordingSession });
    if (event.type === 'energy') { this.energyRef.current = event.meter; this.update({ energyAvailable: Boolean(event.meter) }); }
    if (event.type === 'transcript') {
      this.update({ finalText: event.final, interimText: event.interim }); this.persistDraft();
    }
    if (event.type === 'notice') this.update({ notice: event.message });
    if (event.type === 'error') {
      this.update({ continuous: false });
      this.update({ status: 'error', inputActive: false, recordingSession: false, error: event.message, retryable: Boolean(this.failedTurn), typedText: this.snapshot.typedText || [this.snapshot.finalText, this.snapshot.interimText].filter(Boolean).join(' ') || this.previousDraft || '' });
      this.persistDraft();
    }
    if (event.type === 'stopped') {
      this.captureEndedAt=Date.now();
      this.captureTiming = { t1: event.t1, t2: event.interim ? null : event.t2 };
      this.update({ status: 'idle', inputActive: false, recordingSession: false, notice: event.reason || '' });
      if (event.interim) this.update({ continuous:false,typedText: event.text, notice: 'Some words are unconfirmed. Review or edit the text, then send.' });
      this.persistDraft();
      if (event.submit && event.final && !event.interim) void this.send({ text: event.final });
      else if (event.submit && !event.text) this.update({ continuous:false,notice: 'No words were recognized. Try recording again or type your reply.' });
    }
  }
  setTypedText(text) { this.update({ typedText: text }); this.persistDraft(); }
  async startContinuous() {
    if (this.disposed || this.ended || this.completing) return false;
    this.activate();
    this.configure({ autoEnd: true });
    this.update({ continuous: true });
    if (this.snapshot.typedText.trim() || this.snapshot.interimText || this.snapshot.finalText) {
      this.update({ continuous: false, notice: 'Your unsent reply is kept. Send it before resuming voice conversation.' });
      return false;
    }
    if (!this.started) {
      this.started = true;
      const opening = this.snapshot.messages.length === 1 ? this.snapshot.messages[0] : null;
      if (opening?.role === 'ai' && !opening.endedAt && this.snapshot.autoPlay) return this.playMessage(opening.id);
    }
    return this.startRecording();
  }
  async pauseContinuous() {
    this.update({ continuous: false });
    this.cancelRequest(); this.stopPlayback();
    if (this.capture.recognition || this.capture.starting) await this.capture.stop({ submit: false });
    this.persistDraft();
  }
  configure(patch) {
    if (['autoEnd', 'silenceMs', 'autoPlay'].some(key => key in patch)) {
      if (patch.autoPlay === false) this.stopPlayback();
      this.update(patch);
      this.capture.autoEnd = this.snapshot.autoEnd;
      if (this.capture.detector) this.capture.detector.silenceMs = this.snapshot.silenceMs;
    }
  }
  async startRecording({ restart = false } = {}) {
    if (this.capture.permissionPending) { this.update({ notice: "A browser microphone prompt is still pending. Finish or close it before recording again; you can type meanwhile." }); return false; }
    if (this.pending) this.cancelRequest();
    if (this.disposed || this.ended || this.completing || this.pending || this.sending || this.capture.starting || this.capture.stopping || (this.capture.recognition && !restart)) return false;
    this.stopPlayback();
    if (restart) this.capture.cancel();
    this.captureTiming = null;
    this.previousDraft = clean(this.snapshot.typedText || [this.snapshot.finalText, this.snapshot.interimText].filter(Boolean).join(' '));
    this.failedTurn = null;
    this.update({ error: null, notice: '', retryable: false, recordingSession: false, finalText: '', interimText: '', typedText: '' });
    this.persistDraft();
    return this.capture.start({ autoEnd: this.snapshot.autoEnd, silenceMs: this.snapshot.silenceMs });
  }
  stopRecording() { return this.capture.stop({ submit: true }); }
  cancelRecording() { this.capture.cancel(); this.update({ status: "idle", inputActive: false, recordingSession: false, notice: "Voice input cancelled. You can record again or type." }); this.persistDraft(); }
  /** @param {{ text?: string }} input */
  async send({ text } = {}) {
    if (this.disposed || this.ended || this.completing || this.pending || this.sending) return false;
    const typed = clean(text ?? this.snapshot.typedText);
    this.sending = true;
    try {
      const needsCaptureEnd = Boolean(this.capture.recognition);
      if (this.capture.recognition || this.capture.starting) {
        const stopped = await this.capture.stop({ submit: false });
        if (needsCaptureEnd && !stopped) return false;
      }
      if (this.disposed || this.ended) return false;
      // An interim-only segment needs explicit review/edit, not silent promotion.
      const value = typed || clean(this.snapshot.interimText ? '' : this.snapshot.finalText);
      if (!value) { this.update({ notice: 'Wait for confirmed words, or review and type your reply before sending.' }); return false; }
      this.stopPlayback();
      const id = `turn-${++this.sequence}`;
      const recordingId = this.audioTake ? await this.audioTake.stop() : null;
      if (this.audioTake) { this.audioTake.id=null;this.audioTake.done=null;this.audioTake.recorder=null; }
      if (this.disposed || this.ended) return false;
      const user = { recordingId, id: `user-${id}`, turnId: id, sessionId: this.sessionId, role: 'user', content: value, rawTranscript: this.snapshot.finalText || null, time: stamp(), startedAt: recordingId ? this.captureStartedAt : Date.now(), endedAt: recordingId ? this.captureEndedAt||Date.now() : Date.now() };
      const turn = { id, user, continuous:this.snapshot.continuous,history: [...this.snapshot.messages, user], controller: new AbortController(), metrics: { ...this.captureTiming, turnId: id, sessionId:this.sessionId,t3: null, t4: null, t5: null } };
      this.captureTiming = null;
      this.previousDraft = '';
      this.update({ status: 'submitting', error: null, retryable: false, notice: '', messages: turn.history, typedText: '', finalText: '', interimText: '' });
      this.failedTurn = null;
      this.persistDraft();
      // Launch owns the lock until the request finishes, but sending returns once
      // ownership is established; cancel/retry need not wait for a hung transport.
      void this.launch(turn);
      return true;
    } finally { this.sending = false; }
  }
  applyTurnFeedback(turnId, feedback) {
    if (this.disposed || this.ended || !feedback) return false;
    const id = `user-${turnId}`;
    if (!this.snapshot.messages.some(message => message.id === id)) return false;
    this.update({ messages: this.snapshot.messages.map(message => message.id === id ? { ...message, feedback } : message) });
    return true;
  }
  async launch(turn) {
    this.pending = turn;
    turn.metrics.requestStarted = this.now();
    this.persistDraft();
    this.update({ status: 'processing', streamingText: '' });
    let deadline, onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(turn.controller.signal.reason || Object.assign(new Error('Request cancelled.'), { name: 'AbortError' }));
      turn.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = new Promise((_, reject) => {
      deadline = this.env.setTimeout(() => {
        const error = Object.assign(new Error('AI request timed out. Your reply is kept. Retry the request or continue typing.'), { name: 'TimeoutError' });
        turn.controller.abort(error);
        reject(error);
      }, this.requestTimeoutMs);
    });
    turn.deadline = deadline;
    try {
      const requestTurn = () => this.request(turn.user.content, { signal: turn.controller.signal, turnId: turn.id, history: turn.history, onDelta: delta => {
        if (this.pending !== turn || turn.controller.signal.aborted || this.disposed) return;
        turn.metrics.firstTokenAt ??= this.now();
        this.update({ streamingText: this.snapshot.streamingText + delta });
      } });
      const withRecovery = async () => {
        try { return await requestTurn(); }
        catch (error) {
          const transient = error.retryable === true || error instanceof TypeError || [408, 502, 503, 504].includes(error.status);
          if (!transient || turn.controller.signal.aborted || this.disposed || this.pending !== turn || this.snapshot.streamingText) throw error;
          this.update({ notice: 'Reconnecting to the coach… Your reply is saved.' });
          return requestTurn();
        }
      };
      const result = await Promise.race([withRecovery(), timeout, aborted]);
      if (this.disposed || this.pending !== turn || turn.controller.signal.aborted) return;
      turn.metrics.t3 = this.now();
      const reply = clean(result?.reply);
      if (!reply) throw new Error('The response contained no usable reply. Retry the request; your words are kept.');
      let visual = this.visualFor(reply);
      const lastVisual = [...this.snapshot.messages].reverse().find(message => message.role === 'ai' && message.visual?.key)?.visual?.key;
      if (visual?.key === lastVisual) visual = null;
      const ai = { id: `ai-${turn.id}`, turnId: turn.id, sessionId: this.sessionId, startedAt: Date.now(), playbackId: `ai-${turn.id}`, role: 'ai', content: reply, source: result.source || 'ai', model: result.model || null, fallbackReason: result.fallback_reason || null, aiRole: this.aiRole, visual, time: stamp() };
      turn.metrics.providerFirstTokenMs = result.firstTokenMs ?? null;
      turn.metrics.providerTotalMs = result.totalMs ?? null;
      const messages = this.snapshot.messages.map(message => message.id === turn.user.id && result.feedback ? { ...message, feedback: result.feedback } : message);
      this.pending = null;
      this.lastTurn = turn;
      this.playbackTurn = turn;
      const fallback = result.source === 'fallback' || result.fallback_reason;
      this.update({ status: fallback ? 'error' : 'idle', streamingText: '', messages: [...messages, ai], error: fallback ? 'The online coach is unavailable. Local practice guidance is shown; retry online or continue.' : null, retryable: Boolean(fallback), notice: '', timings: [...this.snapshot.timings, turn.metrics] });
      if (fallback) this.failedTurn = { ...turn, aiId: ai.id };
      this.persistDraft();
      if (!fallback && this.snapshot.autoPlay) void this.playMessage(ai.id);
      else if (!fallback && this.snapshot.continuous) void this.startRecording();
    } catch (error) {
      if (this.disposed || this.pending !== turn) return;
      this.failTurn(turn, error?.name === 'AbortError' ? 'Request stopped. Your reply is kept; retry when ready.' : error?.message || 'Could not reach the coach. Your reply is kept; check your connection and retry.');
    } finally { this.env.clearTimeout(deadline); turn.controller.signal.removeEventListener('abort', onAbort); }
  }
  failTurn(turn, message) {
    if (this.pending !== turn || this.disposed) return;
    turn.controller.abort(); this.env.clearTimeout(turn.deadline);
    this.pending = null; this.failedTurn = turn;
    this.update({ status: 'error', streamingText: '', continuous: false, error: message, retryable: true });
    this.persistDraft();
  }
  cancelRequest() {
    if (!this.pending) return;
    const turn = this.pending;
    turn.controller.abort(); this.env.clearTimeout(turn.deadline);
    this.pending = null; this.failedTurn = turn;
    this.update({ status: 'idle', error: null, retryable: true, notice: 'Request cancelled. Your reply is kept. Retry it, or start another turn.' });
    this.persistDraft();
  }
  retryRequest() {
    if (this.pending || this.disposed || this.ended || this.completing || !this.failedTurn || this.capture.recognition || this.capture.starting) return false;
    this.stopPlayback();
    const prior = this.failedTurn;
    const messages = this.snapshot.messages.filter(message => message.id !== prior.aiId);
    const turn = { ...prior, controller: new AbortController(), history: messages.slice(0, messages.findIndex(message => message.id === prior.user.id) + 1), metrics: { ...prior.metrics, t3: null, t4: null, t5: null } };
    this.failedTurn = null;
    this.update({ messages, continuous:Boolean(prior.continuous),error: null, retryable: false, notice: '', status: 'submitting' });
    void this.launch(turn);
    return true;
  }
  playbackEvent(event) {
    if (this.disposed || this.ended) return;
    const message = this.snapshot.messages.find(item => item.id === event.playbackId);
    if (event.type === 'start' && message && this.playingId === message.id) {
      if (this.playbackTurn?.id && message.id === `ai-${this.playbackTurn.id}`) {
        this.playbackTurn.metrics.t4 ??= this.now();
        this.update({ timings: [...this.snapshot.timings] });
      }
      this.update({ status: 'speaking', activePlaybackId: message.id, speechText: event.text || '', voiceSource: event.provider || 'browser', notice: '' });
      this.update({messages:this.snapshot.messages.map(item=>item.id===message.id?{...item,startedAt:Date.now()}:item)});
    }
    if (event.type === 'pause' && this.snapshot.activePlaybackId === event.playbackId) this.update({ activePlaybackId: null, status: 'idle', notice: 'Voice playback paused. Tap Play audio to restart, or continue with your reply.' });
    if (event.type === 'end' && this.snapshot.activePlaybackId === event.playbackId) {
      if (event.reason === 'ended') this.lastPlaybackEnd = this.now();
      this.update({ activePlaybackId: null, status: this.snapshot.error ? 'error' : 'idle', notice: '', timings: [...this.snapshot.timings] });
      this.update({messages:this.snapshot.messages.map(item=>item.id===message?.id?{...item,endedAt:Date.now()}:item)});
    }
  }
  async playMessage(id) {
    if (this.disposed || this.ended || this.completing || this.pending || this.sending || this.capture.recognition || this.capture.starting || this.capture.stopping) return false;
    const message = this.snapshot.messages.find(item => item.id === id && item.role === 'ai');
    if (!message) return false;
    if (this.playingId === id) { this.stopPlayback(); return true; }
    this.stopPlayback();
    const generation = ++this.playGeneration;
    this.playingId = id;
    this.lastPlaybackEnd = null;
    this.update({ notice: 'Preparing voice playback. You can stop it by tapping Play audio again, or begin recording.', error: this.failedTurn ? this.snapshot.error : null, status: this.failedTurn ? this.snapshot.status : 'idle' });
    try {
      const options = { concise: false, maxChars: 1800, playbackId: id };
      const ok = await (message.audioId && this.audio.playFixedVoice ? this.audio.playFixedVoice(message.audioId, message.content, this.voiceGender, options) : message.source === 'ai' && this.audio.playDynamicVoice ? this.audio.playDynamicVoice(message.content, this.voiceGender, options) : this.audio.playAIVoice(message.content, this.voiceGender, options));
      if (generation !== this.playGeneration || this.disposed || this.ended) return false;
      this.playingId = null;
      if (ok && this.playbackTurn && id === `ai-${this.playbackTurn.id}` && this.playbackTurn.metrics.t5 === null) {
        this.playbackTurn.metrics.t5 = this.lastPlaybackEnd ?? this.now();
        this.update({ timings: [...this.snapshot.timings] });
      }
      if (!ok) this.update({ status: 'error', continuous:false,activePlaybackId: null, error: 'Audio could not play. The reply is available in text. Tap Play audio to retry, or begin your next reply.' });
      if (ok && this.snapshot.continuous && !this.disposed && !this.ended && !this.completing) await this.startRecording();
      return ok;
    } catch {
      if (generation === this.playGeneration && !this.disposed && !this.ended) this.update({ status: 'error', continuous:false,activePlaybackId: null, error: 'Audio playback failed. Read the reply or tap Play audio to retry.' });
      return false;
    }
  }
  stopPlayback() {
    ++this.playGeneration;
    if (this.playingId || this.snapshot.activePlaybackId) this.audio?.stop();
    this.playingId = null;
    this.update({ notice: '' });
    if (this.snapshot.status === 'speaking') this.update({ status: this.snapshot.error ? 'error' : 'idle', activePlaybackId: null });
  }
  async complete() {
    this.update({ continuous: false });
    if (this.disposed) return null;
    if (this.completing) return this.completion;
    if (this.ended) return this.snapshot;
    this.completionCancelled = false;
    this.completing = true;
    this.completion = this.finishSession();
    return this.completion;
  }
  async finishSession() {
    this.cancelRequest(); this.stopPlayback();
    if (this.capture.recognition) await this.capture.stop({ submit: false });
    if (this.disposed || this.completionCancelled) { this.completing = false; this.completion = null; return null; }
    this.capture.cancel(); this.ended = true;
    this.persistDraft();
    this.update({ status: 'completed', inputActive: false, recordingSession: false, activePlaybackId: null });
    return this.snapshot;
  }
  dispose() {
    if (this.disposed) return;
    void this.audioTake?.stop();
    this.persistDraft(); this.disposed = true; this.cancelRequest(); this.stopPlayback();
    this.capture.dispose(); this.energyRef.current = null; this.unsubscribeAudio?.();
    this.env.navigator?.mediaDevices?.removeEventListener?.('devicechange', this.deviceChanged);
    this.env.window?.removeEventListener?.('offline', this.offline);
    this.env.window?.removeEventListener?.('pagehide', this.pagehide);
    this.listeners.clear();
  }
}
