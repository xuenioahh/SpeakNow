export const SPEECH_SAMPLE_RATE = 16000;
export const MAX_SPEECH_SECONDS = 130;

export function encodeSpeechWav(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SPEECH_SAMPLE_RATE, true); view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

// Accept one canonical PCM format so duration and sample counts come from bytes,
// never from a client-supplied duration or a changed transcript.
export function decodeSpeechWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at, count) => String.fromCharCode(...bytes.subarray(at, at + count));
  if (bytes.length < 46 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE' || text(12, 4) !== 'fmt ' || text(36, 4) !== 'data' ||
    view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== SPEECH_SAMPLE_RATE || view.getUint32(28, true) !== 32000 ||
    view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 || view.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2) throw new Error('Use 16 kHz mono PCM WAV audio.');
  const count = (bytes.length - 44) / 2;
  if (count > SPEECH_SAMPLE_RATE * MAX_SPEECH_SECONDS) throw new Error('Recording exceeds the 130-second assessment limit.');
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(44 + i * 2, true) / 32768;
  return samples;
}

export function analyzeSpeechAudio(samples, sampleRate = SPEECH_SAMPLE_RATE) {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Recording is empty.');
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02)), frames = [];
  let power = 0, peak = 0, clipped = 0;
  for (let at = 0; at < samples.length; at += frameSize) {
    let framePower = 0;
    const end = Math.min(samples.length, at + frameSize);
    for (let i = at; i < end; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) throw new Error('Invalid audio samples.');
      framePower += value * value; peak = Math.max(peak, Math.abs(value));
      if (Math.abs(value) >= 0.995) clipped++;
    }
    power += framePower;
    frames.push({ start: at / sampleRate, end: end / sampleRate, rms: Math.sqrt(framePower / (end - at)) });
  }
  const db = value => Math.max(-100, 20 * Math.log10(Math.max(value, 0.00001)));
  const levels = frames.map(frame => frame.rms).sort((a, b) => a - b);
  const threshold = Math.max(0.008, Math.min(0.025, levels[Math.floor(levels.length * 0.15)] * 2.5));
  const pauses = [];
  let quietStart = null, activeSeconds = 0;
  for (const frame of frames) {
    if (frame.rms <= threshold) quietStart ??= frame.start;
    else {
      activeSeconds += frame.end - frame.start;
      if (quietStart !== null && frame.start - quietStart >= 0.5) pauses.push({ start: quietStart, end: frame.start });
      quietStart = null;
    }
  }
  const durationSeconds = samples.length / sampleRate;
  if (quietStart !== null && durationSeconds - quietStart >= 0.5) pauses.push({ start: quietStart, end: durationSeconds });
  const internalPauses = pauses.filter(pause => pause.start > 0 && pause.end < durationSeconds);
  const issues = [];
  if (durationSeconds < 2) issues.push({ code: 'too-short', message: 'Record at least a few seconds for useful feedback.' });
  if (peak < 0.003) issues.push({ code: 'silent', message: 'Almost no sound was captured. Check your microphone and record again.' });
  else if (db(Math.sqrt(power / samples.length)) < -38) issues.push({ code: 'quiet', message: 'The recording is quiet. Move closer to the microphone or increase its input level.' });
  if (clipped / samples.length >= 0.001) issues.push({ code: 'clipping', message: 'The recording reaches the input limit. Lower the microphone level or move farther away.' });
  return { version: 1, source: 'recorded-audio', durationSeconds, rmsDbfs: db(Math.sqrt(power / samples.length)), peakDbfs: db(peak),
    clippedRatio: clipped / samples.length, activeSeconds, quietSeconds: durationSeconds - activeSeconds,
    pauseCount: internalPauses.length, longestPauseSeconds: Math.max(0, ...internalPauses.map(pause => pause.end - pause.start)),
    pauses: internalPauses.slice(0, 100), issues,
    limitation: 'Sound activity and quiet intervals are amplitude estimates. They do not identify speech, diagnose noise, or measure pronunciation.' };
}
