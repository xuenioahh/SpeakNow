import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const baselinePath = process.env.SPEAKNOW_AUDIO_BASELINE;
if (!baselinePath) throw new Error('Set SPEAKNOW_AUDIO_BASELINE to the pre-change audioManager.js snapshot. Measurements use fixtures, not a real network/browser.');
const measurements = [];
const synth = {
  getVoices: () => [{ name: 'Samantha', lang: 'en-US' }], resume() {}, cancel() {},
  speak(utterance) { queueMicrotask(() => { utterance.onstart?.(); queueMicrotask(() => utterance.onend?.()); }); },
};
globalThis.window = { speechSynthesis: synth, setTimeout, clearTimeout };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const old = await import(`data:text/javascript,${encodeURIComponent(fs.readFileSync(baselinePath, 'utf8'))}`);
const current = await import('../src/lib/audioManager.js');
for (const [label, manager] of [['before', old.audioManager], ['after', current.audioManager]]) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t3 = performance.now(); let t4;
    manager.onSpeakingChange = playing => { if (playing && t4 === undefined) t4 = performance.now(); };
    await manager.playAIVoice('A short response.', 'female', { playbackId: `timing-${i}` });
    samples.push(Number((t4 - t3).toFixed(3)));
  }
  manager.stop(); measurements.push({ label, stage: 'T3-to-T4 frontend warm voice fixture', samplesMs: samples, averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(3)) });
}
console.log(JSON.stringify({ kind: 'controlled SpeechSynthesis fixture; excludes ASR, real TTS and network delay', measurements }, null, 2));
