// Analyze only an existing capture stream. This module never opens a microphone.
export function createAudioEnergy(stream) {
  const AudioContext = window.AudioContext || window['webkitAudioContext'];
  if (!AudioContext) return null;
  const context = new AudioContext();
  let source, analyser;
  try {
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
  } catch (error) {
    source?.disconnect();
    analyser?.disconnect();
    void context.close().catch(() => {});
    throw error;
  }
  const samples = new Float32Array(analyser.fftSize);
  let level = 0, lastTime = 0, disposed = false;
  void context.resume().catch(() => {});
  const rms = () => {
    if (disposed || context.state !== 'running') return 0;
    analyser.getFloatTimeDomainData(samples);
    let power = 0;
    for (const sample of samples) power += sample * sample;
    return Math.sqrt(power / samples.length);
  };
  return {
    readRms: rms,
    read(now = performance.now()) {
      if (disposed || context.state !== 'running') return 0;
      const next = Math.min(1, Math.max(0, rms() * 5 - 0.015));
      const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 1 / 60;
      lastTime = now;
      // Time-based response is consistent at both 30fps and 60fps.
      const blend = 1 - Math.exp(-delta / (next > level ? 0.05 : 0.14));
      level += (next - level) * blend;
      return level;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => {});
    },
  };
}
