import { useEffect } from 'react';
export default function LiveScorePanel({ onScoresChange }) {
  useEffect(() => { onScoresChange?.({}); }, [onScoresChange]);
  return null;
}
