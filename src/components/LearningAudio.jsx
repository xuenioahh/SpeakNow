import { useEffect, useState } from 'react';
import { recordingBlob } from '@/lib/learningStore';
export default function LearningAudio({
  attempt,
  recordingId
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      objectUrl;
    recordingBlob(attempt, recordingId).then(blob => {
      if (active) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt.id, recordingId]);
  return url ? <audio controls preload="metadata" src={url} aria-label="Your recording" onError={() => setError('Recording could not be played in this browser.')} /> : <p role="status">{error || 'Loading recording…'}</p>;
}
