// Stable Audio Manager using browser SpeechSynthesis as primary TTS.
// This keeps voice playback behavior in one place so pages only need to request
// speech, stop speech, and react to playback state changes.
import { apiFetch } from '../api/http.js';
import { savedFixedAudio } from './fixedAudioLibrary.js';
import { createSpeechOutput } from './voice/speechOutput.js';
export class StableAudioManager {
  constructor() {
    this.isPlaying = false;
    this.onSpeakingChange = null;
    this.currentPlaybackId = null;
    this.onPlaybackMetaChange = null;
    this._playRequestId = 0;
    this._voicesReady = false;
    this._voicesLoadedCallbacks = [];
    this._listeners = new Set();
    this._voiceWaits = new Set();
    this._cancelUtterance = null;
    this._dynamicTtsMode = null;
    this.outputEnergyRef = { current: null };
    this.spatialFrame = null;

    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        this._voicesReady = true;
      } else {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          if (!this._voicesReady) {
            this._voicesReady = true;
            this._voicesLoadedCallbacks.forEach(cb => cb());
            this._voicesLoadedCallbacks = [];
          }
        }, { once: true });
      }
    }
  }

  _pickVoice(voices, voiceGender) {
    const normalizedGender = voiceGender === "male" ? "male" : "female";
    const englishVoices = (voices || []).filter((voice) => String(voice.lang || "").toLowerCase().startsWith("en"));
    const genderHints = normalizedGender === "female"
      ? ["female", "samantha", "ava", "victoria", "zira", "karen", "moira"]
      : ["male", "daniel", "alex", "fred", "thomas", "jorge"];

    return englishVoices.find((voice) => {
      const name = String(voice.name || "").toLowerCase();
      return genderHints.some((hint) => name.includes(hint));
    }) || englishVoices[0] || null;
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _publish(type, playbackId, reason = '', meta = {}) {
    this.isPlaying = type === 'start';
    this.currentPlaybackId = this.isPlaying ? playbackId : null;
    this.onSpeakingChange?.(this.isPlaying);
    this.onPlaybackMetaChange?.(this.currentPlaybackId);
    for (const listener of this._listeners) listener({ type, playbackId, reason, ...meta });
  }

  _speakUtterance(utterance, requestId, playbackId, startTimeoutMs = 5000) {
    return new Promise((resolve) => {
      let finished = false;
      let startTimer, endTimer;
      const done = (ok, reason) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(startTimer); window.clearTimeout(endTimer);
        if (this._cancelUtterance === cancel) this._cancelUtterance = null;
        utterance.onstart = utterance.onend = utterance.onerror = utterance.onpause = utterance.onresume = utterance.onboundary = null;
        if (requestId === this._playRequestId) this._publish('end', playbackId, reason);
        resolve(ok);
      };
      const cancel = () => done(false, 'cancelled');
      this._cancelUtterance = cancel;
      const start = () => {
        if (finished || requestId !== this._playRequestId) return;
        window.clearTimeout(startTimer);
        this._publish('start', playbackId, '', { text: utterance.text, provider: 'browser' });
      };
      utterance.onboundary = event => {
        if (finished || requestId !== this._playRequestId) return;
        // Native boundary events are evidence of timing; no estimated word clock.
        for (const listener of this._listeners) listener({ type: 'boundary', playbackId, text: utterance.text, charIndex: event.charIndex, elapsedTime: event.elapsedTime, name: event.name });
      };
      utterance.onstart = start;
      utterance.onresume = start;
      utterance.onpause = () => {
        if (!finished && requestId === this._playRequestId) this._publish('pause', playbackId, 'paused');
      };
      utterance.onend = () => done(requestId === this._playRequestId, 'ended');
      utterance.onerror = () => done(false, 'playback_error');
      startTimer = window.setTimeout(() => {
        done(false, 'start_timeout');
        try { window.speechSynthesis.cancel(); } catch { /* Browser blocked playback. */ }
      }, startTimeoutMs);
      endTimer = window.setTimeout(() => {
        done(false, 'playback_timeout');
        try { window.speechSynthesis.cancel(); } catch { /* Browser speech stalled. */ }
      }, Math.min(90000, Math.max(15000, utterance.text.length * 150 / (utterance.rate || 1))));
      try { window.speechSynthesis.speak(utterance); }
      catch { done(false, 'playback_error'); }
    });
  }

  isSupported() {
    return typeof window !== "undefined" && Boolean(window.speechSynthesis);
  }

  _getVoices() {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) return resolve(voices);
      let timeout;
      const finish = () => {
        window.clearTimeout(timeout);
        this._voiceWaits.delete(finish);
        this._voicesLoadedCallbacks = this._voicesLoadedCallbacks.filter(callback => callback !== finish);
        resolve(window.speechSynthesis.getVoices());
      };
      timeout = window.setTimeout(finish, 1200);
      this._voicesLoadedCallbacks.push(finish);
      this._voiceWaits.add(finish);
    });
  }

  _condenseText(text, options = {}) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    const {
      concise = false,
      maxSentences = 2,
      maxChars = 180,
    } = options;

    if (!concise && normalized.length <= maxChars) {
      return normalized;
    }

    // Long model replies sound unnatural when read verbatim. Condensing them
    // keeps playback usable during rapid back-and-forth practice.
    const sentenceMatches = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
    const selected = sentenceMatches
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .slice(0, concise ? maxSentences : sentenceMatches.length);
    let condensed = selected.join(" ").trim();

    if (condensed.length > maxChars) {
      condensed = `${condensed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
    }

    return condensed || normalized.slice(0, maxChars).trimEnd();
  }

  _chunkSpeechText(text, maxChunkChars = 90) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
    const chunks = [];
    let current = "";

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      if (!current) {
        current = sentence;
        continue;
      }

      if (`${current} ${sentence}`.length <= maxChunkChars) {
        current = `${current} ${sentence}`;
      } else {
        chunks.push(current);
        current = sentence;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  async playAIVoice(text, voiceGender = 'female', options = {}) {
    const speechText = this._condenseText(text, options);
    if (!this.isSupported() || !speechText) return false;

    this.stop();
    const requestId = this._playRequestId;
    const playbackId = options.playbackId || null;
    try { window.speechSynthesis.resume(); } catch { /* Some browsers require a gesture. */ }

    const voices = await this._getVoices();
    if (requestId !== this._playRequestId) return false;
    const preferredVoice = this._pickVoice(voices, voiceGender);
    const chunks = this._chunkSpeechText(speechText, options.chunkChars || 90);

    const attemptSpeakChunk = async (chunkText, voice = preferredVoice) => {
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.lang = 'en-US';
      utterance.rate = options.rate || 1;
      utterance.pitch = voiceGender === 'female' ? 1.05 : 0.95;
      if (voice) utterance.voice = voice;

      if (requestId !== this._playRequestId) return false;
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
      return this._speakUtterance(utterance, requestId, playbackId, options.startTimeoutMs);
    };

    const speakChunks = async (voice = preferredVoice) => {
      for (const chunk of chunks) {
        if (requestId !== this._playRequestId) return false;
        const ok = await attemptSpeakChunk(chunk, voice);
        if (!ok) return false;

      }
      return true;
    };

    return speakChunks(preferredVoice);
  }

  async playDynamicVoice(text, voiceGender = 'female', options = {}) {
    const generation = this._playRequestId;
    if (this._dynamicTtsMode === null) {
      try {
        const response = await apiFetch('/api/voice-capabilities');
        const value = response.ok ? await response.json() : {};
        this._dynamicTtsMode = value.dynamicTts === 'elevenlabs' ? 'elevenlabs' : 'browser';
      } catch { this._dynamicTtsMode = 'browser'; }
    }
    if (generation !== this._playRequestId) return false;
    if (this._dynamicTtsMode !== 'elevenlabs') return this.playAIVoice(text, voiceGender, options);
    const pending = this._playServerVoice(text, options), playbackGeneration = this._playRequestId;
    const ok = await pending;
    if (ok || playbackGeneration !== this._playRequestId) return ok;
    return this.playAIVoice(text, voiceGender, options);
  }

  async playFixedVoice(audioId, text, voiceGender = 'female', options = {}) {
    const generation = this._playRequestId;
    const entry = await savedFixedAudio(audioId, text);
    if (generation !== this._playRequestId) return false;
    if (!entry) return this.playAIVoice(text, voiceGender, options);
    const pending = this.playSavedAudio(entry.audioUrl, { ...options, text }), playbackGeneration = this._playRequestId;
    const ok = await pending;
    if (ok || playbackGeneration !== this._playRequestId) return ok;
    return this.playAIVoice(text, voiceGender, options);
  }

  async playSavedAudio(url, { playbackId = null, text = '' } = {}) {
    this.stop();
    const requestId = this._playRequestId;
    const audio = new Audio(url);
    let ended = false, started = false, resolveDone, output = null;
    const done = new Promise(resolve => { resolveDone = resolve; });
    const finish = (ok, reason) => {
      if (ended) return;
      ended = true;
      output?.dispose(); if (this.outputEnergyRef.current === output) this.outputEnergyRef.current = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (this._cancelUtterance === cancel) this._cancelUtterance = null;
      if (requestId === this._playRequestId && started) this._publish('end', playbackId, reason);
      resolveDone(ok);
    };
    const cancel = () => finish(false, 'cancelled');
    this._cancelUtterance = cancel;
    audio.onplaying = () => { if (!ended && !started && requestId === this._playRequestId) { started = true; this._publish('start', playbackId, '', { text, provider: 'saved' }); } };
    audio.onended = () => finish(true, 'ended');
    audio.onerror = () => finish(false, 'playback_error');
    try { output = await createSpeechOutput(audio); if (ended) { output?.dispose(); return done; } this.outputEnergyRef.current = output; if (this.spatialFrame) output?.setSpatialFrame(this.spatialFrame); await audio.play(); } catch { finish(false, 'playback_error'); }
    return done;
  }

  async _playServerVoice(text, { playbackId = null } = {}) {
    this.stop();
    const requestId = this._playRequestId;
    const controller = new AbortController();
    const audio = new Audio();
    let objectUrl = '', started = false, ended = false;
    let output = null;
    const cleanup = () => {
      output?.dispose();
      if (this.outputEnergyRef.current === output) this.outputEnergyRef.current = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (this._cancelUtterance === cancel) this._cancelUtterance = null;
    };
    const finish = (ok, reason) => {
      if (ended) return;
      ended = true; controller.abort();
      if (requestId === this._playRequestId && started) this._publish('end', playbackId, reason);
      cleanup();
      resolver(ok);
    };
    let resolver;
    const done = new Promise(resolve => { resolver = resolve; });
    const cancel = () => finish(false, 'cancelled');
    this._cancelUtterance = cancel;
    audio.onplaying = () => { if (!ended && !started && requestId === this._playRequestId) { started = true; this._publish('start', playbackId, '', { text, provider: 'elevenlabs' }); } };
    audio.onended = () => finish(true, 'ended');
    audio.onerror = () => finish(false, 'playback_error');
    (async () => {
      try {
        const response = await apiFetch('/api/dynamic-tts', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, requestId: crypto.randomUUID() }) });
        if (!response.ok || !response.body) throw new Error('NPC voice unavailable');
        output = await createSpeechOutput(audio);
        if (ended) { output?.dispose(); return; }
        this.outputEnergyRef.current = output;
        if (this.spatialFrame) output?.setSpatialFrame(this.spatialFrame);
        if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported?.('audio/mpeg')) {
          audio.src = objectUrl = URL.createObjectURL(await response.blob());
          await audio.play();
          return;
        }
        const media = new MediaSource();
        audio.src = objectUrl = URL.createObjectURL(media);
        await new Promise((resolve, reject) => { media.addEventListener('sourceopen', resolve, { once: true }); media.addEventListener('error', reject, { once: true }); });
        const source = media.addSourceBuffer('audio/mpeg');
        const reader = response.body.getReader();
        let playbackStarted = false;
        while (!ended) {
          const chunk = await reader.read();
          if (chunk.done) break;
          await new Promise((resolve, reject) => {
            source.addEventListener('updateend', resolve, { once: true });
            source.addEventListener('error', reject, { once: true });
            source.appendBuffer(chunk.value);
          });
          if (!playbackStarted && source.buffered.length && source.buffered.end(0) > 0.1) {
            playbackStarted = true;
            await audio.play();
          }
        }
        if (!playbackStarted && !ended) await audio.play();
        if (!ended && media.readyState === 'open') media.endOfStream();
      } catch { if (!ended) finish(false, 'tts_error'); }
    })();
    return done;
  }

  setSpatialFrame(frame) { this.spatialFrame = frame; this.outputEnergyRef.current?.setSpatialFrame(frame); }

  stop() {
    const wasPlaying = this.isPlaying;
    const playbackId = this.currentPlaybackId;
    this._cancelUtterance?.();
    this._playRequestId += 1;
    for (const finish of [...this._voiceWaits]) finish();
    try { window.speechSynthesis?.cancel(); } catch { /* Already cancelled. */ }
    if (this.isPlaying || wasPlaying && this.currentPlaybackId) this._publish('end', playbackId, 'cancelled');
    this.isPlaying = false;
    this.currentPlaybackId = null;
  }

}

export const audioManager = new StableAudioManager();
