// Presentation only: never modify saved values, score scales or scoring functions.
export function hasReportedScore(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
}
export function displayScore(value) { return hasReportedScore(value) ? String(value) : '—'; }
export function completeScoreVector(scores) {
  const values = Object.values(scores || {});
  return values.length > 0 && values.every(hasReportedScore);
}
export function displayRecordDate(value) {
  if (value === null || value === undefined || value === '') return 'Date unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
}
export function displayDuration(value) {
  if (!hasReportedScore(value) || Number(value) < 0) return '—';
  const seconds = Number(value);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
