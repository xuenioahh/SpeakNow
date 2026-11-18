// Shared frame pump for the existing MediaPipe worker. Never records or uploads video.
export function startVisionSession(video, { onSample, onStatus, clock = () => performance.now() / 1000 }) {
  let active = true, ready = false, busy = false, captureFailures = 0, inferenceFailures = 0, frameDeadline, nextAt = 0, interval = 250;
  const worker = new Worker('/expression-worker.js');
  const stop = () => { active = false; clearInterval(timer); clearTimeout(deadline); clearTimeout(frameDeadline); worker.terminate(); };
  const fail = () => { if (active) onStatus('unavailable'); stop(); };
  const deadline = setTimeout(fail, 25000);
  worker.onmessage = ({ data }) => {
    if (!active) return;
    if (data.type === 'ready') ready = true;
    if (data.type === 'error') fail();
    if (data.type === 'sample') {
      clearTimeout(frameDeadline); busy = false;
      interval = Math.max(250, Math.min(1200, (data.processingMs || 0) * 2.5)); nextAt = performance.now() + interval;
      const inference = data.inference || {};
      if (!Object.values(inference).some(Boolean)) {
        onStatus('loading');
        if (++inferenceFailures >= 3) fail();
        return;
      }
      inferenceFailures = 0; clearTimeout(deadline);
      onStatus(['face', 'pose', 'hands'].every(model => inference[model]) ? 'ready' : 'partial');
      onSample(data);
    }
  };
  worker.onerror = fail;
  const timer = setInterval(async () => {
    if (!active || !ready || busy || video.readyState < 2 || performance.now()<nextAt) return;
    busy = true;
    frameDeadline = setTimeout(fail, 7000);
    let frame;
    try {
      frame = await createImageBitmap(video);
      if (!active) { frame.close(); return; }
      worker.postMessage({ type: 'frame', frame, timestamp: performance.now(), time: clock() }, [frame]);
      captureFailures = 0;
    } catch {
      frame?.close();
      clearTimeout(frameDeadline); busy = false;
      // A transient capture failure may recover; repeated failures must not
      // leave the UI claiming analysis is ready without any usable frames.
      if (++captureFailures >= 3) fail();
    }
  }, 250);
  onStatus('loading');
  worker.postMessage({ type: 'init' });
  return stop;
}
