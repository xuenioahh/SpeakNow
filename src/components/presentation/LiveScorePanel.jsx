import { useEffect } from 'react';
export default function LiveScorePanel({ onScoresChange }) {
  useEffect(() => { onScoresChange?.({}); }, [onScoresChange]);
  return <div className="glass rounded-xl p-5"><h3>Recorded evidence, not live scoring</h3><p className="text-sm text-muted-foreground">Pronunciation, fluency, posture and eye contact are not measured here. Review your recording; content feedback is an AI Coaching Suggestion.</p></div>;
}
