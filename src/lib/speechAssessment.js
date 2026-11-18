import { analyzeSpeechAudio, encodeSpeechWav, MAX_SPEECH_SECONDS, SPEECH_SAMPLE_RATE } from '../../shared/speechAudio.js';
import { learningStore } from './learningStore';

const qualityJobs = new Map();
export function cacheRecordingQuality(recording) {
  const key = `${recording.id}:${recording.blob.size}`;
  if (!qualityJobs.has(key)) {
    const job = prepareSpeechAudio(recording.blob).then(async prepared => {
      const latest = await learningStore.get('recordings', recording.id);
      if (latest?.blob?.size === recording.blob.size) await learningStore.put('recordings', { ...latest, audioQuality: prepared.quality, audioQualitySize: recording.blob.size });
      return prepared.quality;
    });
    qualityJobs.set(key, job);
    job.finally(() => qualityJobs.delete(key)).catch(() => {});
  }
  return qualityJobs.get(key);
}

export async function prepareSpeechAudio(blob) {
  const AudioContext = window.AudioContext || window['webkitAudioContext'];
  if (!AudioContext || !window.OfflineAudioContext) throw new Error('Audio analysis is unavailable in this browser. Try Chrome, Edge or Safari.');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || decoded.duration > MAX_SPEECH_SECONDS) throw new Error('Use a recording of up to 130 seconds for audio assessment.');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE), SPEECH_SAMPLE_RATE);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const rendered = await offline.startRendering(), samples = rendered.getChannelData(0);
    return { quality: analyzeSpeechAudio(samples), wav: encodeSpeechWav(samples) };
  } finally { await context.close().catch(() => {}); }
}

export function audioBase64(bytes) {
  let value = '';
  for (let at = 0; at < bytes.length; at += 16384) value += String.fromCharCode(...bytes.subarray(at, at + 16384));
  return btoa(value);
}
