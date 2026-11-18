import { useEffect, useRef, useState } from 'react';
import { startVisionSession } from '@/lib/expressionVisionSession';

// The parent mounts this preview only after the user chooses to enable their camera.
export default function CameraPreview({ onSample = null, onClip = null, onCameraStatus = null, startedAt = 0, captureRef = null }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [analysis, setAnalysis] = useState('loading');
  const [clipUnavailable, setClipUnavailable] = useState(false);
  useEffect(() => {
    let stream = null, active = true, stopVision = null, recorder = null, clipTimer = null;
    const release = () => { active = false; clearTimeout(clipTimer); if (recorder?.state === 'recording') recorder.stop(); stream?.getTracks().forEach(track => track.stop()); stopVision?.(); };
    if(captureRef)captureRef.current={stop:async()=>{
      active=false;clearTimeout(clipTimer);stopVision?.();
      if(recorder?.state==='recording')await new Promise(resolve=>{const timer=setTimeout(resolve,2000);recorder.addEventListener('stop',()=>{clearTimeout(timer);resolve(null);},{once:true});recorder.stop();});
      stream?.getTracks().forEach(track=>track.stop());
    }};
    const onPageHide = () => { active = false; release(); setStatus('error'); onCameraStatus?.('unavailable'); };
    window.addEventListener('pagehide', onPageHide);
    const deadline = setTimeout(() => { active = false; release(); setStatus('error'); }, 20000);
    (async () => {
      try {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: Boolean(onClip) }); }
        catch (error) {
          if (!onClip) throw error;
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          setClipUnavailable(true);
        }
        if (!active) { release(); return; }
        clearTimeout(deadline);
        stream.getVideoTracks().forEach(track => { track.onended = onPageHide; });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!active) { release(); return; }
        setStatus('active');
        onCameraStatus?.('active');
        if (onClip && stream.getAudioTracks().length && typeof MediaRecorder !== 'undefined') {
          const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
          if (mime) {
            const recordWindow = () => {
              if (!active) return;
              const began = Date.now();
              const hasAudio=stream.getAudioTracks().length>0;
              const parts = [];
              recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 420000 });
              recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
              recorder.onstop = () => {
                const end = Date.now();
                if (parts.length && end - began >= 5000 && end-began<=10000) onClip({ id: crypto.randomUUID(), sessionStartedAt:startedAt,start: Math.max(0, (began - startedAt) / 1000), end: (end - startedAt) / 1000, blob: new Blob(parts, { type: mime }), hasAudio });
                if (active) recordWindow();
              };
              recorder.start();
              clipTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 8000);
            };
            recordWindow();
          } else setClipUnavailable(true);
        } else if (onClip) setClipUnavailable(true);
        if (onSample) {
          try { stopVision = startVisionSession(videoRef.current, { onSample, onStatus: setAnalysis, clock: () => (Date.now() - startedAt) / 1000 }); }
          catch { setAnalysis('unavailable'); }
        }
      } catch { clearTimeout(deadline); if (active) { setStatus('error'); onCameraStatus?.('unavailable'); } release(); }
    })();
    return () => { active = false; clearTimeout(deadline); window.removeEventListener('pagehide', onPageHide); release();if(captureRef)captureRef.current=null; };
  }, [onSample, onClip, onCameraStatus, startedAt,captureRef]);
  return <div className="camera-preview">
    <video ref={videoRef} autoPlay playsInline muted hidden={status !== 'active'} aria-label="Your camera preview" />
    <p role="status">{status === 'error' ? 'Camera unavailable. Voice practice still works; turn the camera off and retry.' : status === 'loading' ? 'Requesting camera access…' : clipUnavailable ? 'Preview on · audio video clip unavailable' : analysis === 'unavailable' ? 'Visual analysis unavailable · voice practice still works' : analysis === 'partial' ? 'Partial visual analysis · some detectors unavailable · on device' : onClip ? 'Camera and microphone on · short clips buffered locally' : onSample ? analysis === 'ready' ? 'Camera analysis active · on device' : 'Loading visual analysis…' : 'Camera preview only · no analysis'}</p>
  </div>;
}
