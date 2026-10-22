import assert from 'node:assert/strict';
import { VoiceInteraction } from '../src/lib/voice/VoiceInteraction.js';
import { VoiceCapture } from '../src/lib/voice/VoiceCapture.js';
import { EndpointDetector } from '../src/lib/voice/endpointDetector.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
class Audio {
  listeners = new Set(); plays = []; stops = 0;
  subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
  playAIVoice(text, gender, options) { const playback = { text, id: options.playbackId, ...deferred() }; this.plays.push(playback); this.current = playback; return playback.promise; }
  emit(event) { this.listeners.forEach(listener => listener(event)); }
  start() { this.emit({ type: 'start', playbackId: this.current.id }); }
  end(ok = true) { this.emit({ type: 'end', playbackId: this.current.id, reason: 'ended' }); this.current.resolve(ok); this.current = null; }
  stop() { this.stops++; if (this.current) { this.emit({ type: 'end', playbackId: this.current.id, reason: 'cancelled' }); this.current.resolve(false); this.current = null; } }
}
const env = { setTimeout, clearTimeout, setInterval, clearInterval, navigator: {}, window: {} };
const make = options => {
  const audio = new Audio(); const states = []; const drafts = [];
  const session = new VoiceInteraction({ audio, environment: env, request: async text => ({ source: 'ai', reply: `Reply to ${text}`, feedback: { grammar: 'clear' } }), initialMessage: { id: 'intro', role: 'ai', content: 'Hello' }, saveDraft: text => drafts.push(text), ...options });
  session.subscribe(() => states.push(session.getSnapshot().status)); session.activate();
  return { session, audio, states, drafts };
};
{
  const { session, audio, states } = make();
  for (let i = 0; i < 5; i++) {
    session.setTypedText(`My answer number ${i}`);
    const sends = await Promise.all([session.send(), session.send(), session.send()]);
    assert.equal(sends.filter(Boolean).length, 1, 'single synchronous turn lock');
    await tick(); assert.equal(session.getSnapshot().status, 'idle', 'queued playback is not speaking');
    audio.start(); assert.equal(session.getSnapshot().status, 'speaking');
    audio.end(); await tick(); assert.equal(session.getSnapshot().status, 'idle');
  }
  const messages = session.getSnapshot().messages;
  assert.equal(messages.filter(m => m.role === 'user').length, 5);
  assert.equal(messages.filter(m => m.role === 'ai').length, 6);
  assert.equal(new Set(messages.map(m => m.id)).size, 11);
  assert(messages.filter(m => m.role === 'user').every(m => m.feedback.grammar === 'clear'));
  assert(states.includes('submitting') && states.includes('processing') && states.includes('speaking'));
  assert(session.getSnapshot().timings.every(t => Number.isFinite(t.t3) && t.t4 >= t.t3 && t.t5 >= t.t4));
  session.dispose(); assert.equal(audio.listeners.size, 0);
}
console.log('PASS: five continuous turns, duplicate-send lock, exact response/feedback identity, truthful playback and T3/T4/T5');
{
  const old = deferred(), newer = deferred(); let calls = 0; const signals = [];
  const { session, audio } = make({ request: (_, options) => { signals.push(options.signal); return ++calls === 1 ? old.promise : newer.promise; } });
  session.setTypedText('Keep this answer'); await session.send(); session.cancelRequest();
  assert(signals[0].aborted); assert.equal(session.getSnapshot().retryable, true);
  assert(session.retryRequest()); assert.equal(session.getSnapshot().messages.filter(m => m.role === 'user').length, 1);
  old.resolve({ reply: 'stale reply' }); await tick(); assert(!session.getSnapshot().messages.some(m => m.content === 'stale reply'));
  newer.resolve({ reply: 'current reply' }); await tick(); audio.start(); audio.end(); await tick();
  assert.equal(session.getSnapshot().messages.filter(m => m.content === 'current reply').length, 1);
  assert.equal(session.getSnapshot().status, 'idle'); session.dispose();
}
console.log('PASS: cancelled transport, stale-response isolation and retry without duplicate user messages');
{
  let attempt = 0;
  const { session, audio } = make({ request: async () => { if (++attempt === 1) throw new Error('offline'); return { reply: 'Recovered' }; } });
  session.setTypedText('Do not lose my reply'); await session.send(); await tick();
  assert.equal(session.getSnapshot().status, 'error'); assert.equal(session.getSnapshot().messages.at(-1).content, 'Do not lose my reply');
  session.retryRequest(); await tick(); audio.end(false); await tick();
  assert.equal(session.getSnapshot().status, 'error'); assert.equal(session.getSnapshot().messages.at(-1).content, 'Recovered');
  void session.playMessage(session.getSnapshot().messages.at(-1).id); audio.start(); audio.end(); await tick();
  assert.equal(session.getSnapshot().status, 'idle'); session.dispose();
}
{
  const { session } = make({ request: () => new Promise(() => {}), requestTimeoutMs: 10 });
  session.setTypedText('Timeout preserves words'); await session.send(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(session.getSnapshot().status, 'error'); assert.match(session.getSnapshot().error, /timed out/); session.dispose();
}
{
  const pending = deferred(); const { session, audio } = make({ request: () => pending.promise });
  session.setTypedText('Leave during request'); await session.send(); session.dispose();
  pending.resolve({ reply: 'Must not play after exit' }); await tick(); assert.equal(audio.plays.length, 0);
  assert(!session.getSnapshot().messages.some(m => m.content === 'Must not play after exit'));
}
console.log('PASS: recoverable network/timeout/playback failures, retained text and no response/audio after disposal');

let requests = 0, disposedMeters = 0, recognized = [], tracks = [], pendingPermission;
class Recognition {
  constructor() { recognized.push(this); }
  start(track) { this.track = track; }
  stop() { this.stopCalled = true; }
  abort() { this.aborted = true; }
}
const stream = () => {
  const track = { readyState: 'live', kind: 'audio', stop() { this.readyState = 'ended'; } };
  tracks.push(track); return { getTracks: () => [track], getAudioTracks: () => [track] };
};
const captureEnv = { ...env, window: { SpeechRecognition: Recognition }, navigator: { userAgent: 'Chrome/145.0.0.0', mediaDevices: { getUserMedia: async () => { requests++; return stream(); } } } };
const factory = options => new VoiceCapture({ environment: captureEnv, createMeter: () => ({ read: () => 0.2, readRms: () => 0.1, dispose: () => disposedMeters++ }), ...options });
const result = (recognition, text, final) => recognition.onresult({ results: [{ isFinal: final, 0: { transcript: text } }] });
{
  const events = []; const capture = factory({ onEvent: event => events.push(event) });
  const starts = await Promise.all([capture.start(), capture.start(), capture.start()]);
  assert.equal(starts.filter(Boolean).length, 1); assert.equal(requests, 1);
  const recognition = recognized.at(-1); assert.equal(recognition.track, tracks.at(-1));
  assert(!events.some(event => event.phase === 'listening'));
  recognition.onstart(); assert.equal(events.at(-1).phase, 'listening');
  result(recognition, 'temporary words', false);
  const stopped = capture.stop({ submit: true });
  assert.equal(events.at(-1).phase, 'stopping'); assert.equal(recognition.onresult instanceof Function, true, 'keep final-result callback after stop');
  recognition.onaudioend(); assert.equal(tracks.at(-1).readyState, 'ended');
  result(recognition, 'confirmed complete sentence', true); recognition.onend();
  const final = await stopped; assert.equal(final.final, 'confirmed complete sentence'); assert.equal(final.interim, ''); assert(final.t2 >= final.t1);
  assert.equal(events.at(-1).type, 'stopped'); assert.equal(disposedMeters, 1); capture.dispose();
}
{
  const events = []; const capture = factory({ onEvent: event => events.push(event) });
  await capture.start(); const recognition = recognized.at(-1); recognition.onstart(); result(recognition, 'Keep final words', true);
  recognition.onend(); await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(requests, 2, 'native restart keeps the same owner stream');
  const next = recognized.at(-1); next.onstart(); result(next, 'and more words', true);
  assert.equal(capture.final, 'Keep final words and more words'); capture.dispose();
}
{
  const events = []; const capture = factory({ onEvent: event => events.push(event), finishTimeoutMs: 10 });
  await capture.start(); const recognition = recognized.at(-1); recognition.onstart(); result(recognition, 'Unconfirmed text kept', false);
  const stopped = capture.stop({ submit: true }); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await stopped, null); assert.equal(events.at(-1).type, 'error'); assert.equal(capture.interim, 'Unconfirmed text kept'); assert.equal(tracks.at(-1).readyState, 'ended'); capture.dispose();
}
{
  const old = captureEnv.navigator.mediaDevices.getUserMedia;
  captureEnv.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { pendingPermission = resolve; });
  const capture = factory(); const started = capture.start(); capture.dispose(); const late = stream(); pendingPermission(late); await started;
  assert.equal(late.getTracks()[0].readyState, 'ended'); captureEnv.navigator.mediaDevices.getUserMedia = old;
}
{
  const old = captureEnv.navigator.mediaDevices.getUserMedia;
  captureEnv.navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
  const events = []; const capture = factory({ onEvent: event => events.push(event) });
  await capture.start(); assert.equal(events.at(-1).type, 'error'); assert.match(events.at(-1).message, /browser settings/); capture.dispose(); captureEnv.navigator.mediaDevices.getUserMedia = old;
}
assert(tracks.every(track => track.readyState === 'ended'));
console.log('PASS: capture acknowledgement, rapid-click lock, late final ASR, native restart, finish timeout, permissions and stream disposal');

{
  const detector = new EndpointDetector(); let time = 0;
  const samples = (rms, ms) => { let endpoint = false; for (let i = 0; i < ms; i += 50) endpoint ||= detector.update(rms, time += 50); return endpoint; };
  assert.equal(samples(0.004, 1000), false);
  assert.equal(samples(0.12, 100), false);
  assert.equal(samples(0.004, 4000), false, 'short clicks cannot end a turn');
  assert.equal(samples(0.12, 1000), false);
  assert.equal(samples(0.004, 1800), false, 'natural thinking pause');
  assert.equal(samples(0.12, 500), false);
  assert.equal(samples(0.004, 2600), true);
}
console.log('PASS: RMS endpoint noise filtering, hysteresis, short-noise rejection and natural pauses');
{
  const events = []; const capture = factory({ onEvent: event => events.push(event) });
  await capture.start(); const recognition = recognized.at(-1); recognition.onstart(); result(recognition, 'Stop between native sessions', true);
  recognition.onend(); const count = recognized.length;
  const stopped = await capture.stop({ submit: true });
  assert.equal(stopped.final, 'Stop between native sessions');
  assert.equal(events.at(-1).type, 'stopped');
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(recognized.length, count, 'manual stop cancels an in-between native restart');
  assert.equal(tracks.at(-1).readyState, 'ended'); capture.dispose();
}
{
  const detector = new EndpointDetector(); let time = 0;
  for (let burst = 0; burst < 8; burst++) {
    for (let i = 0; i < 4; i++) assert.equal(detector.update(0.12, time += 50), false);
    for (let i = 0; i < 60; i++) assert.equal(detector.update(0.003, time += 50), false);
  }
}
{
  const request = deferred(); const saved = [];
  const { session } = make({ request: () => request.promise, saveDraft: value => saved.push(value) });
  session.setTypedText('Pending text must survive exit'); await session.send(); session.dispose();
  assert.equal(saved.at(-1), 'Pending text must survive exit');
  request.resolve({ reply: 'ignored' }); await tick();
}
console.log('PASS: stop between ASR instances, repeated short-noise rejection and pending-draft persistence');
{
  let rms = 0.003, now = 0, meterPoll;
  const endpoints = [];
  const capture = new VoiceCapture({
    environment: { ...captureEnv, setInterval: callback => { meterPoll = callback; return 1; }, clearInterval() {} },
    now: () => now,
    onEvent: event => endpoints.push(event),
    createMeter: () => ({ readRms: () => rms, read: () => rms, dispose() {} }),
  });
  await capture.start({ autoEnd: true, silenceMs: 2500 });
  const recognition = recognized.at(-1); recognition.onstart();
  const advance = ms => { for (let i = 0; i < ms; i += 50) { now += 50; meterPoll(); } };
  advance(1000); rms = 0.1; advance(800);
  result(recognition, 'Endpoint words still provisional', false);
  rms = 0.003; advance(1800); assert.equal(recognition.stopCalled, undefined);
  rms = 0.1; advance(500); rms = 0.003; advance(2600);
  assert.equal(recognition.stopCalled, true); assert.equal(endpoints.at(-1).phase, 'stopping');
  assert(!endpoints.some(event => event.type === 'stopped'), 'VAD does not claim ASR has already finished');
  recognition.onaudioend(); result(recognition, 'Confirmed endpoint sentence', true); recognition.onend();
  assert.equal(endpoints.at(-1).type, 'stopped'); assert.equal(endpoints.at(-1).submit, true); capture.dispose();
}
{
  const original = captureEnv.navigator.mediaDevices.getUserMedia;
  captureEnv.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [], getAudioTracks: () => [] });
  const events = []; const capture = factory({ onEvent: event => events.push(event) });
  await capture.start(); assert.equal(events.at(-1).type, 'error'); assert.match(events.at(-1).message, /No microphone/); capture.dispose();
  captureEnv.navigator.mediaDevices.getUserMedia = original;
}
{
  const { session, audio } = make({ captureOptions: { environment: captureEnv } });
  // The store controls its own environment; exercise its event routes directly.
  session.captureEvent({ type: 'transcript', final: 'Words from a disconnected device', interim: '' });
  session.captureEvent({ type: 'error', message: 'Device disconnected; retry.' });
  assert.equal(session.getSnapshot().typedText, 'Words from a disconnected device');
  assert(await session.send()); await tick(); audio.start(); audio.end(); await tick(); session.dispose();
}
console.log('PASS: capture VAD integration waits for actual ASR end, missing-device recovery and reviewed transcript resend');
{
  const listeners = new Map();
  const pending = deferred();
  const environment = { ...env, window: { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) } };
  const { session, audio } = make({ environment, request: () => pending.promise });
  session.setTypedText('Keep this request across a page leave'); await session.send();
  listeners.get('offline')(); assert.equal(session.getSnapshot().status, 'error');
  listeners.get('pagehide')(); assert.equal(session.getSnapshot().status, 'idle');
  pending.resolve({ reply: 'stale after page leave' }); await tick(); assert.equal(audio.plays.length, 0);
  session.setTypedText('A new draft after returning'); assert.equal(session.getSnapshot().typedText, 'A new draft after returning');
  session.dispose(); assert.equal(listeners.size, 0);
}
console.log('PASS: offline/pagehide cleanup, no orphan playback and recoverable browser back-cache draft');
{
  const events = []; const capture = factory({ maxRecordingMs: 10, onEvent: event => events.push(event) });
  await capture.start(); const recognition = recognized.at(-1); recognition.onstart();
  result(recognition, 'Words at the time limit', true);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(recognition.stopCalled, true);
  recognition.onaudioend(); recognition.onend();
  assert.equal(events.at(-1).submit, false); assert.equal(events.at(-1).final, 'Words at the time limit');
  assert.match(events.at(-1).reason, /time limit/); capture.dispose();
}
{
  const { session } = make({ saveDraft: () => { throw new Error('storage blocked'); } });
  session.setTypedText('Keep in-memory words even if storage fails');
  assert.equal(session.getSnapshot().draftStorageUnavailable, true);
  assert.equal(session.getSnapshot().typedText, 'Keep in-memory words even if storage fails'); session.dispose();
}
console.log('PASS: maximum recording duration keeps text for review, and blocked draft storage is explicit');
{
  const original = captureEnv.navigator.mediaDevices.getUserMedia; const waiting = deferred(); let prompts = 0;
  captureEnv.navigator.mediaDevices.getUserMedia = () => { prompts++; return waiting.promise; };
  const capture = factory(); const first = capture.start(); capture.cancel();
  assert.equal(await capture.start(), false); assert.equal(prompts, 1, 'a cancelled unresolved permission prompt cannot create a second capture request');
  const late = stream(); waiting.resolve(late); await first; assert.equal(late.getTracks()[0].readyState, 'ended');
  capture.dispose(); captureEnv.navigator.mediaDevices.getUserMedia = original;
}
console.log('PASS: rapid cancel/restart never overlaps unresolved microphone permission requests');
