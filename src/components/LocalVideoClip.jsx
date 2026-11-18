import { useEffect, useState } from 'react';
import { learningStore } from '@/lib/learningStore';

export default function LocalVideoClip({ id }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true, objectUrl = '';
    learningStore.get('recordings', id).then(value => {
      if (!value?.blob?.size) throw new Error('This local clip is unavailable on this device.');
      objectUrl = URL.createObjectURL(value.blob);
      if (active) setUrl(objectUrl);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (error) return <p role="status">{error}</p>;
  return url ? <video controls playsInline preload="metadata" src={url} aria-label="Your recorded practice moment" style={{ width: 'min(100%, 480px)', borderRadius: 12 }} /> : <p role="status">Loading video moment…</p>;
}
