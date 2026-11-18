// Decoded media audio only. SpeechSynthesis has no PCM and gets no fake meter.
export async function createSpeechOutput(audio) {
  const Context = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!Context) return null;
  const context = new Context();
  try {
    await context.resume();
    const source = context.createMediaElementSource(audio), analyser = context.createAnalyser(), panner = context.createPanner();
    analyser.fftSize = 512; panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse';
    panner.refDistance = 4; panner.rolloffFactor = .2; panner.maxDistance = 30;
    source.connect(analyser); analyser.connect(panner); panner.connect(context.destination);
    const buffer = new Float32Array(analyser.fftSize);
    const set = (parameter, value) => parameter.setTargetAtTime(value, context.currentTime, .025);
    let disposed = false;
    return {
      readRms() { if (disposed || audio.paused || audio.ended) return 0; analyser.getFloatTimeDomainData(buffer); return Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length); },
      setSpatialFrame({ position, forward, up, speaker }) {
        if (disposed) return;
        const listener = context.listener;
        if (listener.positionX) ['X', 'Y', 'Z'].forEach((axis, index) => { set(listener[`position${axis}`], position[index]); set(listener[`forward${axis}`], forward[index]); set(listener[`up${axis}`], up[index]); set(panner[`position${axis}`], speaker[index]); });
      },
      dispose() { if (disposed) return; disposed = true; source.disconnect(); analyser.disconnect(); panner.disconnect(); void context.close(); },
    };
  } catch { void context.close(); return null; }
}
