// Shared frame pump for the existing MediaPipe worker. Never records or uploads video.
export function startVisionSession(video, { onSample, onStatus, clock = () => performance.now() / 1000 }) {
  let active = true, ready = false, busy = false, frameDeadline;
  const worker = new Worker('/expression-worker.js');
  const stop = () => { active = false; clearInterval(timer); clearTimeout(deadline); clearTimeout(frameDeadline); worker.terminate(); };
  const fail = () => { if (active) onStatus('unavailable'); stop(); };
  const deadline = setTimeout(fail, 25000);
  worker.onmessage = ({ data }) => {
    if (!active) return;
    if (data.type === 'ready') { ready = true; clearTimeout(deadline); onStatus('ready'); }
    if (data.type === 'error') fail();
    if (data.type === 'sample') { clearTimeout(frameDeadline); busy = false; onSample(data); }
  };
  worker.onerror = fail;
  const timer = setInterval(async () => {
    if (!active || !ready || busy || video.readyState < 2) return;
    busy = true;
    frameDeadline = setTimeout(fail, 7000);
    try {
      const frame = await createImageBitmap(video);
      if (!active) { frame.close(); return; }
      worker.postMessage({ type: 'frame', frame, timestamp: performance.now(), time: clock() }, [frame]);
    } catch { clearTimeout(frameDeadline); busy = false; }
  }, 250);
  onStatus('loading');
  worker.postMessage({ type: 'init' });
  return stop;
}
