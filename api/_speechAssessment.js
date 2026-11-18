import { createHash } from 'node:crypto';
import { analyzeSpeechAudio, decodeSpeechWav } from '../shared/speechAudio.js';

export function speechConfiguration() {
  return { configured: Boolean(process.env.AZURE_SPEECH_KEY && /^[a-z][a-z0-9-]{1,40}$/.test(process.env.AZURE_SPEECH_REGION || '')),
    provider: 'azure-speech', language: 'en-US' };
}
const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;

export function normalizeSpeechResults(results, durationSeconds) {
  const segments = results.flatMap(result => {
    if (result?.RecognitionStatus !== 'Success') return [];
    const best = result.NBest?.[0], assessment = best?.PronunciationAssessment || best;
    if (!best || score(assessment?.AccuracyScore) === null) return [];
    const words = (best.Words || []).flatMap(word => {
      const measurement = word.PronunciationAssessment || word;
      if (typeof word.Word !== 'string' || score(measurement.AccuracyScore) === null) return [];
      return [{ word: word.Word.slice(0, 100), accuracy: score(measurement.AccuracyScore), error: String(measurement.ErrorType || 'None').slice(0, 50),
        start: Math.max(0, Number(word.Offset) / 10000000 || 0), duration: Math.max(0, Number(word.Duration) / 10000000 || 0),
        phonemes: (word.Phonemes || []).slice(0, 30).map(phoneme => ({ phoneme: String(phoneme.Phoneme || '').slice(0, 30), accuracy: score((phoneme.PronunciationAssessment || phoneme).AccuracyScore) })) }];
    });
    return [{ text: String(best.Display || best.Lexical || '').slice(0, 8000), start: Math.max(0, Number(result.Offset) / 10000000 || 0),
      duration: Math.max(0, Number(result.Duration) / 10000000 || 0), accuracy: score(assessment.AccuracyScore),
      fluency: score(assessment.FluencyScore), prosody: score(assessment.ProsodyScore), words }];
  });
  if (!segments.length) throw Object.assign(new Error('No assessable English speech was returned. Check the recording and try again.'), { status: 422, code: 'speech_not_recognized' });
  const average = key => {
    const supported = segments.filter(segment => segment[key] !== null);
    const total = supported.reduce((sum, segment) => sum + Math.max(segment.duration, 0.01), 0);
    return total ? Math.round(supported.reduce((sum, segment) => sum + segment[key] * Math.max(segment.duration, 0.01), 0) / total * 10) / 10 : null;
  };
  return { status: 'assessed', provider: 'azure-speech', basis: 'recorded-audio', language: 'en-US', scale: 100,
    accuracy: average('accuracy'), fluency: average('fluency'), prosody: average('prosody'),
    recognizedText: segments.map(segment => segment.text).join(' '), durationSeconds,
    assessedSeconds: Math.min(durationSeconds, segments.reduce((sum, segment) => sum + segment.duration, 0)),
    segments, issues: segments.flatMap(segment => segment.words).filter(word => word.accuracy < 60 || word.error !== 'None').slice(0, 40),
    aggregation: 'Duration-weighted averages of provider utterance scores. Practice indicators, not an IELTS band score.' };
}

// Push the full PCM recording through continuous recognition. Short REST requests
// can stop at the first utterance and cannot assess a complete Part 2 answer.
export async function assessWithAzure(wav, { sdk: suppliedSdk, referenceText = '' } = {}) {
  const loaded = suppliedSdk || await import('microsoft-cognitiveservices-speech-sdk');
  const sdk = loaded.default || loaded;
  const config = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
  config.speechRecognitionLanguage = 'en-US';
  config.outputFormat = sdk.OutputFormat.Detailed;
  const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
  const audio = sdk.AudioConfig.fromStreamInput(stream), recognizer = new sdk.SpeechRecognizer(config, audio);
  const assessment = new sdk.PronunciationAssessmentConfig(referenceText, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, Boolean(referenceText));
  assessment.enableProsodyAssessment = true;
  assessment.applyTo(recognizer);
  return new Promise((resolve, reject) => {
    const results = [];
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      // The recognizer owns AudioConfig. Closing it a second time throws in the
      // official SDK after the push stream has already been disposed.
      const close = () => { recognizer.close(); config.close(); };
      recognizer.stopContinuousRecognitionAsync(close, close);
      if (error) reject(error); else resolve(results);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('Speech assessment timed out. Your recording is saved; retry assessment.'), { status: 504, code: 'speech_timeout' })), 90000);
    recognizer.recognized = (_, event) => {
      if (settled) return;
      try {
        const raw = event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        if (raw) results.push(JSON.parse(raw));
      } catch { finish(Object.assign(new Error('The speech service returned an invalid result.'), { status: 502 })); }
    };
    recognizer.canceled = (_, event) => finish(event.reason === sdk.CancellationReason.Error ? Object.assign(new Error('Speech assessment is unavailable. Check the speech service configuration or retry later.'), { status: 503, code: 'speech_provider_failed' }) : null);
    recognizer.sessionStopped = () => finish();
    recognizer.startContinuousRecognitionAsync(() => {
      if (settled) return;
      const pcm = wav.subarray(44);
      stream.write(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)); stream.close();
    }, () => finish(Object.assign(new Error('Speech assessment could not start. Retry later.'), { status: 503 })));
  });
}

export async function assessSpeechBytes(bytes, options = {}) {
  let samples;
  try { samples = decodeSpeechWav(bytes); } catch (error) { throw Object.assign(error, { status: 400 }); }
  const quality = analyzeSpeechAudio(samples);
  const base = { quality, audioSha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString() };
  if (quality.issues.some(issue => issue.code === 'silent' || issue.code === 'too-short')) return { ...base, pronunciation: { status: 'unassessable', message: 'Record a longer, audible answer before requesting pronunciation feedback.' } };
  if (!speechConfiguration().configured) return { ...base, pronunciation: { status: 'not-configured', message: 'Pronunciation assessment is awaiting speech service setup. Recording quality checks are available.' } };
  return { ...base, pronunciation: normalizeSpeechResults(await assessWithAzure(bytes, options), quality.durationSeconds) };
}
