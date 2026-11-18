import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { analyzeSpeechAudio, encodeSpeechWav, decodeSpeechWav } from '../../shared/speechAudio.js';
import { normalizeSpeechResults, assessSpeechBytes, assessWithAzure } from '../../api/_speechAssessment.js';
import { validateAttempt } from '../../shared/speakingTasks.js';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-audio-test-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5194';
delete process.env.AZURE_SPEECH_KEY; delete process.env.AZURE_SPEECH_REGION;
const { default: endpoint, handler } = await import('../../api/speaking-audio.js');
const { saveOwned, getOwned } = await import('../../api/_appStore.js');
const tone = (seconds, amplitude = 0.2) => Float32Array.from({ length: seconds * 16000 }, (_, i) => Math.sin(i * 2 * Math.PI * 220 / 16000) * amplitude);
const event = (accuracy = 80, duration = 2, offset = 0) => ({ RecognitionStatus: 'Success', Offset: offset * 10000000, Duration: duration * 10000000,
  NBest: [{ Display: 'A recorded answer.', PronunciationAssessment: { AccuracyScore: accuracy, FluencyScore: 70, ProsodyScore: 65 },
    Words: [{ Word: 'answer', Offset: (offset + 0.5) * 10000000, Duration: 5000000, PronunciationAssessment: { AccuracyScore: 50, ErrorType: 'Mispronunciation' },
      Phonemes: [{ Phoneme: 'ae', PronunciationAssessment: { AccuracyScore: 45 } }] }] }] });
const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.value = value; this.headersSent = true; } });
const makeAttempt = () => ({ id: randomUUID(), track: 'exam', taskId: 'ielts-part1-study-v1', answers: [{ questionIndex: 0, text: 'I study engineering.', inputMode: 'voice', recordingId: randomUUID() }] });
async function call(body, headers = {}) {
  const res = response();
  await endpoint({ method: 'POST', body, socket: { remoteAddress: '127.0.0.12' }, headers: { host: 'localhost:5194', origin: 'http://localhost:5194', 'content-type': 'application/json', ...headers } }, res);
  return res;
}

test('PCM checks distinguish silence, low level and clipping, and measure an internal pause', () => {
  assert.ok(analyzeSpeechAudio(new Float32Array(48000)).issues.some(issue => issue.code === 'silent'));
  assert.ok(analyzeSpeechAudio(tone(3, 0.008)).issues.some(issue => issue.code === 'quiet'));
  assert.ok(analyzeSpeechAudio(new Float32Array(48000).fill(1)).issues.some(issue => issue.code === 'clipping'));
  const samples = tone(4); samples.fill(0, 16000, 32000);
  const result = analyzeSpeechAudio(samples);
  assert.equal(result.pauseCount, 1); assert.ok(Math.abs(result.longestPauseSeconds - 1) < 0.03);
  assert.deepEqual(analyzeSpeechAudio(tone(3)).issues, []);
});
test('WAV validation derives duration from bytes and rejects malformed or oversized recordings', () => {
  const bytes = encodeSpeechWav(tone(120)); assert.equal(decodeSpeechWav(bytes).length, 1920000);
  const malformed = bytes.slice(); malformed[24] = 0; assert.throws(() => decodeSpeechWav(malformed));
  assert.throws(() => decodeSpeechWav(bytes.subarray(0, 300)));
  assert.throws(() => decodeSpeechWav(encodeSpeechWav(tone(131))));
});
test('provider scores and word timestamps come only from audio results; missing scores stay unavailable', () => {
  const second = event(100, 6, 3); delete second.NBest[0].PronunciationAssessment.ProsodyScore;
  const result = normalizeSpeechResults([event(80, 2), second], 10);
  assert.equal(result.accuracy, 95); assert.equal(result.prosody, 65); assert.equal(result.assessedSeconds, 8);
  assert.equal(result.issues[1].start, 3.5); assert.equal(result.issues[0].phonemes[0].accuracy, 45);
  assert.throws(() => normalizeSpeechResults([{ RecognitionStatus: 'Success', NBest: [{ AccuracyScore: '90' }] }], 2));
  assert.throws(() => normalizeSpeechResults([], 2));
});
test('without a speech key real quality remains available and pronunciation is never fabricated', async () => {
  const result = await assessSpeechBytes(encodeSpeechWav(tone(3)));
  assert.equal(result.quality.durationSeconds, 3); assert.equal(result.pronunciation.status, 'not-configured');
  assert.equal(result.pronunciation.accuracy, undefined); assert.match(result.audioSha256, /^[a-f0-9]{64}$/);
  assert.equal((await assessSpeechBytes(encodeSpeechWav(new Float32Array(48000)))).pronunciation.status, 'unassessable');
});
test('IELTS recordings can be analyzed without browser transcription, while typed answers cannot gain audio scores', async () => {
  const value = makeAttempt(); value.answers[0].text = '';
  assert.equal(validateAttempt(value).answers[0].text, '');
  const res = await call({ attempt: value, answerIndex: 0, recordingId: value.answers[0].recordingId, data: Buffer.from(encodeSpeechWav(tone(3))).toString('base64') });
  assert.equal(res.code, 200);
  value.answers[0].inputMode = 'text'; value.answers[0].text = 'Typed words';
  assert.equal((await call({ attempt: value, answerIndex: 0, recordingId: value.answers[0].recordingId, data: Buffer.from(encodeSpeechWav(tone(3))).toString('base64') })).code, 400);
});
test('TOEFL and Daily Conversation use the same real recording assessment endpoint', async () => {
  for (const task of [{ track: 'exam', taskId: 'toefl-repeat-campus-v1' }, { track: 'daily', taskId: 'daily' }]) {
    const attempt = { ...makeAttempt(), ...task }; attempt.answers[0].text = '';
    const res = await call({ attempt, answerIndex: 0, recordingId: attempt.answers[0].recordingId, data: Buffer.from(encodeSpeechWav(tone(3))).toString('base64') });
    assert.equal(res.code, 200); assert.equal(res.value.quality.durationSeconds, 3); assert.equal(res.value.pronunciation.status, 'not-configured');
  }
});
test('continuous SDK sends every sample of a two-minute answer and preserves late utterances', async () => {
  let recognizer, bytesSent = 0, closeCount = 0, applied;
  const sdk = {
    SpeechConfig: { fromSubscription: () => ({ close() {} }) }, OutputFormat: { Detailed: 1 },
    AudioStreamFormat: { getWaveFormatPCM: () => ({}) },
    AudioInputStream: { createPushStream: () => ({ write(bytes) { bytesSent = bytes.byteLength; }, close() {} }) },
    AudioConfig: { fromStreamInput: () => ({ close() {} }) },
    PronunciationAssessmentGradingSystem: { HundredMark: 1 }, PronunciationAssessmentGranularity: { Phoneme: 1 },
    PronunciationAssessmentConfig: class { constructor(reference) { assert.equal(reference, ''); } applyTo() { applied = this.enableProsodyAssessment; } },
    PropertyId: { SpeechServiceResponse_JsonResult: 1 }, CancellationReason: { Error: 1 },
    SpeechRecognizer: class {
      constructor() { recognizer = this; }
      startContinuousRecognitionAsync(start) { start(); queueMicrotask(() => {
        for (const value of [event(80), event(90, 2, 110)]) this.recognized(null, { result: { properties: { getProperty: () => JSON.stringify(value) } } });
        this.sessionStopped();
      }); }
      stopContinuousRecognitionAsync(done) { done(); }
      close() { closeCount++; }
    }
  };
  const result = await assessWithAzure(encodeSpeechWav(tone(120)), { sdk });
  assert.equal(bytesSent, 120 * 16000 * 2); assert.equal(result.length, 2); assert.equal(result[1].Offset, 1100000000);
  assert.equal(closeCount, 1); assert.equal(applied, true); recognizer.sessionStopped(); assert.equal(closeCount, 1);
  sdk.SpeechRecognizer.prototype.startContinuousRecognitionAsync = function(start) {
    start(); queueMicrotask(() => this.canceled(null, { reason: sdk.CancellationReason.Error }));
  };
  await assert.rejects(() => assessWithAzure(encodeSpeechWav(tone(3)), { sdk }), error => error.status === 503 && error.code === 'speech_provider_failed');
  assert.equal(closeCount, 2);
});
test('audio endpoint enforces origins, sessions, valid WAV and the selected IELTS recording', async () => {
  assert.equal((await call({ action: 'status' }, { origin: 'https://elsewhere.invalid' })).code, 403);
  assert.equal((await call({ action: 'status' }, { cookie: 'speaknow_session=forged' })).code, 401);
  assert.equal((await call({ action: 'status' })).value.configured, false);
  const attempt = makeAttempt(), recordingId = attempt.answers[0].recordingId;
  const payload = { attempt, answerIndex: 0, recordingId, data: Buffer.from(encodeSpeechWav(tone(3))).toString('base64') };
  assert.equal((await call(payload)).code, 200);
  assert.equal((await call({ ...payload, recordingId: randomUUID() })).code, 400);
  assert.equal((await call({ ...payload, data: Buffer.from('not audio').toString('base64') })).code, 400);
  assert.equal((await call({ ...payload, data: 'x'.repeat(5550004) })).code, 413);
});
test('owned speech results survive reload and cannot be written to another account', async () => {
  const attempt = makeAttempt(), owner = randomUUID();
  await saveOwned('voiceSessions', owner, { id: attempt.id, report: { learning: { ...validateAttempt(attempt), feedback: { summary: 'Retain text feedback.' } } } });
  const body = { attempt, answerIndex: 0, recordingId: attempt.answers[0].recordingId, data: Buffer.from(encodeSpeechWav(tone(3))).toString('base64') };
  const res = response(); await handler({ body, user: { id: owner } }, res);
  assert.equal(res.code, 200);
  const saved = (await getOwned('voiceSessions', owner, attempt.id)).report.learning;
  assert.equal(saved.audioAssessments[body.recordingId].quality.durationSeconds, 3);
  assert.equal(saved.feedback.summary, 'Retain text feedback.');
  await assert.rejects(() => handler({ body, user: { id: randomUUID() } }, response()), error => error.status === 409);
});
