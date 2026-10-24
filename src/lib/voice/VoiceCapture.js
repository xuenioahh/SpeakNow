import { createAudioEnergy } from '../audioEnergy.js';
import { supportsRecognitionAudioTrack } from '../voiceOrbState.js';
import { EndpointDetector } from './endpointDetector.js';

const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
const permissionMessage = error => ({
  NotAllowedError: 'Microphone access is blocked. Allow it in browser settings, then try again or type your reply.',
  SecurityError: 'Microphone access needs a secure page. Use HTTPS or type your reply.',
  NotFoundError: 'No microphone was found. Connect one, then try again or type your reply.',
  NotReadableError: 'Your microphone is busy or unavailable. Close other recording apps, then try again.',
}[error?.name] || 'Microphone could not start. Check your input device or type your reply.');

export class VoiceCapture {
  /** @param {{ onEvent?: (event: any) => void, environment?: any, now?: () => number, maxRecordingMs?: number, finishTimeoutMs?: number, startTimeoutMs?: number, createMeter?: (stream: MediaStream) => any, retainStream?: boolean, allowRecordingOnly?: boolean }} options */
  constructor({ onEvent, environment = globalThis, now = () => performance.now(), maxRecordingMs = 120000, finishTimeoutMs = 3000, startTimeoutMs = 10000, createMeter = createAudioEnergy, retainStream = false, allowRecordingOnly = false } = {}) {
    this.onEvent = onEvent;
    this.createMeter = createMeter;
    this.retainStream = retainStream;
    this.allowRecordingOnly = allowRecordingOnly;
    this.env = environment;
    this.now = now;
    this.config = { maxRecordingMs, finishTimeoutMs, startTimeoutMs };
    this.generation = 0;
    this.active = false;
    this.permissionPending = false;
    this.disposed = false;
    this.final = '';
    this.interim = '';
    this.sharedRejected = false;
    this.timers = new Set();
  }
  emit(event) { if (!this.disposed) this.onEvent?.(event); }
  timer(callback, ms) {
    const timer = this.env.setTimeout(() => { this.timers.delete(timer); callback(); }, ms);
    this.timers.add(timer);
    return timer;
  }
  clearTimer(timer) { this.env.clearTimeout(timer); this.timers.delete(timer); }
  detach(recognition) {
    if (!recognition) return;
    recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onresult = recognition.onerror = recognition.onend = null;
  }
  releaseAudio() {
    this.env.clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.meter?.dispose(); this.meter = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    this.emit({ type: 'energy', meter: null });
  }
  async start({ autoEnd = false, silenceMs = 2500 } = {}) {
    if (this.disposed || this.starting || this.recognition || this.stopping) return false;
    if (this.permissionPending) { this.emit({ type: 'notice', message: 'A browser microphone prompt is still pending. Finish or close it before recording again; you can type meanwhile.' }); return false; }
    const win = this.env.window || this.env;
    const nav = this.env.navigator;
    const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if ((!Recognition && !this.allowRecordingOnly) || !nav?.mediaDevices?.getUserMedia) {
      this.emit({ type: 'error', message: 'Live voice input is unavailable here. Use a supported browser or type your reply.' });
      return false;
    }
    this.starting = true;
    this.permissionPending = true;
    const generation = ++this.generation;
    this.final = this.interim = '';
    this.autoEnd = autoEnd;
    this.startedAt = this.t1 = this.t2 = null;
    this.restartCount = 0;
    this.emit({ type: 'phase', phase: 'requesting_permission' });
    try {
      const stream = await nav.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed || generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      const track = stream.getAudioTracks()[0];
      if (!track || track.kind !== 'audio' || track.readyState !== 'live') {
        stream.getTracks().forEach(item => item.stop());
        throw Object.assign(new Error('No live microphone track.'), { name: 'NotFoundError' });
      }
      this.shared = supportsRecognitionAudioTrack(nav.userAgent) && !this.sharedRejected;
      if (this.shared || this.retainStream) {
        this.stream = stream;
        try { this.meter = this.createMeter(stream); } catch { this.meter = null; }
        this.emit({ type: 'energy', meter: this.meter });
        if (this.retainStream) this.emit({ type: 'stream', stream });
        stream.getAudioTracks().forEach(track => { track.onended = () => this.fail('Microphone disconnected. Your words are kept. Reconnect it or type your reply.'); });
      } else stream.getTracks().forEach(track => track.stop());
      this.detector = new EndpointDetector({ silenceMs });
      if (Recognition) this.recognize(Recognition, generation);
      else { this.startedAt=this.now();this.active=true;this.emit({type:'phase',phase:'listening'});this.emit({type:'notice',message:'Live transcription is unavailable. Record your answer, then add its transcript for text feedback.'});this.limitTimer=this.timer(()=>this.stop(),this.config.maxRecordingMs); }
      return true;
    } catch (error) {
      if (generation === this.generation && !this.disposed) this.fail(permissionMessage(error));
      return false;
    } finally {
      this.permissionPending = false;
      if (generation === this.generation) this.starting = false;
    }
  }
  recognize(Recognition, generation) {
    if (this.disposed || this.stopping || generation !== this.generation) return;
    const recognition = new Recognition();
    const prefix = this.final;
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    const owns = () => !this.disposed && generation === this.generation && this.recognition === recognition;
    const listening = () => {
      if (!owns() || this.stopping || this.active) return;
      this.active = true;
      this.clearTimer(this.startTimer);
      if (this.startedAt === null) {
        this.startedAt = this.now();
        this.limitTimer = this.timer(() => this.stop({ submit: false, reason: 'Recording time limit reached. Review and send your words, or record again.' }), this.config.maxRecordingMs);
      }
      this.emit({ type: 'phase', phase: 'listening' });
      if (this.meter && !this.meterTimer) this.meterTimer = this.env.setInterval(() => {
        if (!this.active || this.stopping) return;
        const ended = this.detector.update(this.meter.readRms(), this.now());
        if (this.autoEnd && ended) void this.stop({ submit: true, reason: 'Detected a completed speaking pause.' });
      }, 50);
    };
    // Native capture is confirmed by audiostart; shared input is already a live
    // owner track, so onstart may confirm that path as well.
    recognition.onstart = () => { if (this.shared && this.stream?.getAudioTracks()[0]?.readyState === 'live') listening(); };
    recognition.onaudiostart = listening;
    recognition.onresult = event => {
      if (!owns()) return;
      const finals = [], interims = [];
      for (let i = 0; i < event.results.length; i++) (event.results[i].isFinal ? finals : interims).push(event.results[i][0].transcript);
      this.final = join(prefix, ...finals);
      this.interim = join(...interims);
      this.emit({ type: 'transcript', final: this.final, interim: this.interim });
    };
    recognition.onaudioend = () => {
      if (!owns()) return;
      this.active = false;
      if (this.stopping) {
        this.t1 ??= this.now();
        this.releaseAudio();
        this.emit({ type: 'phase', phase: 'finalizing' });
      } else this.emit({ type: 'phase', phase: 'starting' });
    };
    recognition.onerror = event => {
      if (!owns()) return;
      if (event.error === 'no-speech' && !this.stopping) {
        this.emit({ type: 'notice', message: 'No speech recognized yet. Take your time, or stop and type your reply.' });
        return;
      }
      if (event.error === 'aborted' && this.stopping) return;
      this.fail(event.error === 'not-allowed' ? permissionMessage({ name: 'NotAllowedError' }) : `Voice input stopped (${event.error || 'unknown'}). Your words are kept; retry or type your reply.`);
    };
    recognition.onend = () => {
      if (!owns()) return;
      this.detach(recognition);
      this.recognition = null;
      this.active = false;
      this.clearTimer(this.startTimer);
      if (this.stopping) { this.finish(); return; }
      // Never silently discard an unfinished interim segment on native restart.
      if (this.interim) {
        this.releaseAudio();
        this.emit({ type: 'error', message: 'Recognition ended with an unconfirmed transcript. Review the words below and send, or record again.' });
        this.clearTimer(this.limitTimer);
        return;
      }
      if (++this.restartCount > 8) { this.fail('Voice recognition keeps stopping. Your words are kept; send them or retry recording.'); return; }
      this.emit({ type: 'phase', phase: 'starting' });
      this.timer(() => {
        if (generation !== this.generation || this.disposed || this.stopping) return;
        try { this.recognize(Recognition, generation); } catch { this.fail('Voice input could not restart. Your transcript is kept.'); }
      }, 80);
    };
    this.startTimer = this.timer(() => this.fail('Microphone did not start. Check permissions and your input device, then try again.'), this.config.startTimeoutMs);
    this.emit({ type: 'phase', phase: 'starting' });
    try {
      if (this.shared) recognition.start(this.stream.getAudioTracks()[0]);
      else recognition.start();
    } catch (error) {
      if (!this.shared || !['TypeError', 'NotSupportedError'].includes(error?.name)) throw error;
      this.sharedRejected = true; this.shared = false;
      if (!this.retainStream) this.releaseAudio();
      recognition.start();
    }
  }
  stop({ submit = false, reason = '' } = {}) {
    if (this.disposed) return Promise.resolve(null);
    if (this.stopPromise) return this.stopPromise;
    if (!this.recognition) {
      if (this.starting) { this.cancel(); return Promise.resolve(null); }
      if (this.stream || this.startedAt !== null && this.startedAt !== undefined) {
        ++this.generation;
        for (const timer of this.timers) this.env.clearTimeout(timer);
        this.timers.clear();
        this.submitOnEnd = submit; this.stopReason = reason;
        return Promise.resolve(this.finish());
      }
      return Promise.resolve({ text: join(this.final, this.interim), final: this.final, interim: this.interim, submit, reason, t1: null, t2: null });
    }
    this.stopping = true;
    this.submitOnEnd = submit;
    this.stopReason = reason;
    this.stopPromise = new Promise(resolve => { this.resolveStop = resolve; });
    const pending = this.stopPromise;
    this.emit({ type: 'phase', phase: 'stopping' });
    this.clearTimer(this.limitTimer);
    this.clearTimer(this.startTimer);
    this.env.clearInterval(this.meterTimer); this.meterTimer = null;
    this.finishTimer = this.timer(() => this.fail('Recognition did not finish in time. Your transcript is kept; review and send it manually.'), this.config.finishTimeoutMs);
    try { this.recognition.stop(); } catch { this.fail('Voice input could not finish. Your transcript is kept; review and send it.'); }
    return pending;
  }
  finish() {
    this.t1 ??= this.now();
    this.t2 = this.now();
    this.clearTimer(this.finishTimer);
    this.releaseAudio();
    const result = { text: join(this.final, this.interim), final: this.final, interim: this.interim, submit: this.submitOnEnd, reason: this.stopReason, t1: this.t1, t2: this.t2 };
    this.stopping = false;
    const resolve = this.resolveStop;
    this.stopPromise = this.resolveStop = null;
    this.emit({ type: 'stopped', ...result });
    resolve?.(result);
    return result;
  }
  fail(message) {
    this.cancel();
    this.emit({ type: 'error', message });
  }
  cancel() {
    ++this.generation;
    this.starting = this.active = this.stopping = false;
    for (const timer of this.timers) this.env.clearTimeout(timer);
    this.timers.clear();
    const recognition = this.recognition; this.recognition = null;
    this.detach(recognition);
    try { if (recognition?.abort) recognition.abort(); else recognition?.stop(); } catch { /* Already stopped. */ }
    this.releaseAudio();
    this.resolveStop?.(null); this.stopPromise = this.resolveStop = null;
  }
  dispose() { this.disposed = true; this.cancel(); this.onEvent = null; }
}
