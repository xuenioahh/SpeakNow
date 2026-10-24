import { useEffect, useRef, useState } from 'react';
import { startVisionSession } from '@/lib/expressionVisionSession';

// The parent mounts this preview only after the user chooses to enable their camera.
export default function CameraPreview({ onSample = null, startedAt = 0 }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [analysis, setAnalysis] = useState('loading');
  useEffect(() => {
    let stream = null, active = true, stopVision = null;
    const release = () => { stream?.getTracks().forEach(track => track.stop()); stopVision?.(); };
    const onPageHide = () => { active = false; release(); setStatus('error'); };
    window.addEventListener('pagehide', onPageHide);
    const deadline = setTimeout(() => { active = false; release(); setStatus('error'); }, 20000);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!active) { release(); return; }
        clearTimeout(deadline);
        stream.getVideoTracks().forEach(track => { track.onended = onPageHide; });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!active) { release(); return; }
        setStatus('active');
        if (onSample) {
          try { stopVision = startVisionSession(videoRef.current, { onSample, onStatus: setAnalysis, clock: () => (Date.now() - startedAt) / 1000 }); }
          catch { setAnalysis('unavailable'); }
        }
      } catch { clearTimeout(deadline); release(); if (active) setStatus('error'); }
    })();
    return () => { active = false; clearTimeout(deadline); window.removeEventListener('pagehide', onPageHide); release(); };
  }, [onSample, startedAt]);
  return <div className="camera-preview">
    <video ref={videoRef} autoPlay playsInline muted hidden={status !== 'active'} aria-label="Your camera preview" />
    <p role="status">{status === 'error' ? 'Camera unavailable. Voice practice still works; turn the camera off and retry.' : status === 'loading' ? 'Requesting camera access…' : !onSample ? '' : analysis === 'ready' ? 'On-device analysis · video is not saved' : analysis === 'unavailable' ? 'Visual analysis unavailable · voice practice still works' : 'Loading visual analysis…'}</p>
  </div>;
}
