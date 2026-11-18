import { useEffect, useState } from 'react';
import { recordingBlob } from '@/lib/learningStore';
export default function LearningAudio({ attempt, recordingId, label = 'Your recording' }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, objectUrl;
    setUrl(''); setError('');
    recordingBlob(attempt, recordingId).then(blob => {
      if (active) {
        if (!blob.size) throw new Error('Empty recording');
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      }
    }).catch(() => { if (active) setError('Recording unavailable.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attempt.id, recordingId, retry]);
  if (error) return <div><p role="status">{error}</p><button onClick={() => setRetry(n => n + 1)} aria-label={`Retry ${label.toLowerCase()}`}>Retry recording</button></div>;
  return url ? <audio controls preload="metadata" src={url} aria-label={label} onError={() => setError('Recording could not be played.')} /> : <p role="status">Loading recording…</p>;
}
