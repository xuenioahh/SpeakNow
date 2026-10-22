import assert from 'node:assert/strict';
import { createAudioEnergy } from '../src/lib/audioEnergy.js';
import { resolveVoiceOrbState, supportsRecognitionAudioTrack } from '../src/lib/voiceOrbState.js';

let amplitude = 0, closed = 0, disconnected = 0;
class AudioContextFixture {
  state = 'running';
  createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; } }; }
  createAnalyser() { return { fftSize: 512, getFloatTimeDomainData(samples) { samples.fill(amplitude); }, disconnect() { disconnected++; } }; }
  resume() { return Promise.resolve(); }
  close() { closed++; return Promise.resolve(); }
}
globalThis.window = { AudioContext: AudioContextFixture };
const meter = createAudioEnergy({});
let sampleTime = 0;
const sample = () => meter.read(sampleTime += 1000 / 60);
assert.equal(sample(), 0);
amplitude = 0.12;
const attack = sample();
assert(attack > 0 && attack < 0.585, 'smooth the first real amplitude sample');
for (let i = 0; i < 80; i++) sample();
assert(Math.abs(sample() - 0.585) < 0.001);
amplitude = 1;
for (let i = 0; i < 80; i++) assert(sample() <= 1, 'bound energy under loud input');
amplitude = 0;
const release = sample();
assert(release > 0 && release < 1, 'smooth release');
for (let i = 0; i < 120; i++) sample();
assert(sample() < 0.000001);
meter.dispose(); meter.dispose();
assert.equal(closed, 1); assert.equal(disconnected, 2); assert.equal(sample(), 0);
delete window.AudioContext;
assert.equal(createAudioEnergy({}), null, 'unsupported audio remains usable');
window.webkitAudioContext = AudioContextFixture;
const safariMeter = createAudioEnergy({});
assert(safariMeter, 'Safari constructor fallback');
safariMeter.dispose();
console.log('PASS: RMS mapping, smoothing, amplitude cap, silence, idempotent cleanup, unsupported and Safari paths');
assert.equal(resolveVoiceOrbState(), 'idle');
assert.equal(resolveVoiceOrbState({ inputState: 'listening', isSpeaking: true }), 'listening');
assert.equal(resolveVoiceOrbState({ isAiThinking: true }), 'processing');
assert.equal(resolveVoiceOrbState({ isSpeaking: true }), 'speaking');
assert.equal(resolveVoiceOrbState({ hasError: true }), 'error');
assert.equal(resolveVoiceOrbState({ inputState: 'error' }), 'error');
assert.equal(resolveVoiceOrbState({ completed: true, inputState: 'listening' }), 'completed');
assert.equal(supportsRecognitionAudioTrack('Chrome/135.0.0.0'), true);
assert.equal(supportsRecognitionAudioTrack('Chrome/134.0.0.0'), false);
assert.equal(supportsRecognitionAudioTrack('Android Chrome/145.0.0.0 Mobile'), false);
assert.equal(supportsRecognitionAudioTrack('iPhone CriOS/145.0.0.0'), false);
assert.equal(supportsRecognitionAudioTrack('Version/18.0 Safari/605.1.15'), false);
assert.equal(supportsRecognitionAudioTrack(), false);
console.log('PASS: real UI-state adapter and conservative shared-audio-track compatibility');

window.AudioContext = AudioContextFixture;
amplitude = 0.1;
const responseAt = fps => {
  const reader = createAudioEnergy({});
  let time = 1000, result = 0;
  reader.read(time);
  for (let i = 0; i < fps; i++) result = reader.read(time += 1000 / fps);
  reader.dispose();
  return result;
};
assert(Math.abs(responseAt(30) - responseAt(60)) < 0.000001);
const beforeFailure = closed;
window.AudioContext = class extends AudioContextFixture {
  createMediaStreamSource() { throw new Error('stream ended'); }
};
assert.throws(() => createAudioEnergy({}), /stream ended/);
assert.equal(closed, beforeFailure + 1, 'failed analyser construction still closes its context');
console.log('PASS: 30fps/60fps response consistency and failed-construction cleanup');


const utterances = [];
window.speechSynthesis = {
  speaking: false, pending: false,
  getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
  speak: utterance => utterances.push(utterance), cancel() {}, resume() {},
};
window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const { audioManager } = await import('../src/lib/audioManager.js');
const states = [], playback = [];
audioManager.onSpeakingChange = value => states.push(value);
audioManager.onPlaybackMetaChange = value => playback.push(value);
const waitForUtterance = async count => {
  for (let i = 0; i < 60 && utterances.length < count; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(utterances.length >= count, 'speech request reached browser API');
};
const first = audioManager.playAIVoice('Hello there. This is a second sentence.', 'female', { chunkChars: 15, playbackId: 'reply-1' });
await waitForUtterance(1);
assert.equal(audioManager.isPlaying, false, 'queued speech is not speaking');
assert.deepEqual(states, []); assert.deepEqual(playback, []);
utterances[0].onstart(); assert.equal(audioManager.isPlaying, true); assert.equal(playback.at(-1), 'reply-1');
utterances[0].onend();
await waitForUtterance(2);
utterances[1].onstart(); assert.equal(playback.at(-1), 'reply-1', 'all chunks retain their real message identity');
utterances[1].onend(); assert.equal(await first, true); assert.equal(audioManager.isPlaying, false);
const cancelled = audioManager.playAIVoice('Cancelled.', 'female', { playbackId: 'cancelled' });
await waitForUtterance(3); utterances[2].onstart(); const cancelledEnd = utterances[2].onend; audioManager.stop();
const next = audioManager.playAIVoice('Next.', 'female', { playbackId: 'next' });
await waitForUtterance(4); utterances[3].onstart();
cancelledEnd(); assert.equal(audioManager.isPlaying, true, 'late cancelled events cannot clear new playback');
assert.equal(audioManager.currentPlaybackId, 'next'); utterances[3].onend();
assert.equal(await cancelled, false); assert.equal(await next, true);
const failed = audioManager.playAIVoice('Unavailable.', 'female', { playbackId: 'failed' });
await waitForUtterance(5); utterances[4].onerror({ error: 'unavailable' });
assert.equal(await failed, false); assert.equal(audioManager.isPlaying, false);
console.log('PASS: actual speech start/end, chunk identity, stop, stale events, failed playback never claims speaking');
