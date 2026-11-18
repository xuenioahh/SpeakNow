import { useEffect, useState } from 'react';
import { learningStore } from '@/lib/learningStore';
import { prepareSpeechAudio } from '@/lib/speechAssessment';

export function AudioQualityDetails({ quality }) {
  return <div className="audio-quality" aria-label="Recording quality results">
    <p>{quality.issues.length ? 'Before your next take' : 'The recording level looks usable. Replay it if any words seem missing from the transcript.'}</p>
    {quality.issues.map(issue => <p key={issue.code} role="status">{issue.message}</p>)}
    <details><summary>Recording measurements</summary><dl className="audio-metrics">
      <div><dt>Recorded</dt><dd>{quality.durationSeconds.toFixed(1)} s</dd></div>
      <div><dt>Average level</dt><dd>{quality.rmsDbfs.toFixed(1)} dBFS</dd></div>
      <div><dt>Clipped samples</dt><dd>{(quality.clippedRatio * 100).toFixed(2)}%</dd></div>
      <div><dt>Quiet intervals</dt><dd>{quality.quietSeconds.toFixed(1)} s</dd></div>
      <div><dt>Pauses ≥ 0.5 s</dt><dd>{quality.pauseCount}</dd></div>
    </dl>
    <p>{quality.limitation}</p></details>
  </div>;
}

export default function RecordingQuality({ recordingId }) {
  const [quality, setQuality] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setQuality(null); setError('');
    (async () => {
      const recording = await learningStore.get('recordings', recordingId);
      if (!recording?.blob) throw new Error('Recording unavailable for analysis.');
      const result = recording.audioQualitySize === recording.blob.size && recording.audioQuality || (await prepareSpeechAudio(recording.blob)).quality;
      if (!active) return;
      await learningStore.put('recordings', { ...recording, audioQuality: result, audioQualitySize: recording.blob.size });
      if (active) setQuality(result);
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [recordingId]);
  return <details className="recording-quality"><summary>Recording check{quality?.issues.length ? ' · adjustment suggested' : ''}</summary>{quality ? <AudioQualityDetails quality={quality} /> : <p role="status">{error || 'Checking your recording…'}</p>}</details>;
}
