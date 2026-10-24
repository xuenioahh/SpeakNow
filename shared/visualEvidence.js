export const VISUAL_METRICS = { mouth: 'Visible mouth opening variation', head: 'Head orientation variation', headVertical: 'Vertical head movement', eyes: 'Eye position variation (limited estimate)', posture: 'Visible shoulder movement', hands: 'Visible hand movement', leftHand: 'Left wrist height variation', rightHand: 'Right wrist height variation' };
export function validateVisualEvidence(value) {
  if (!value || value.source !== 'device-mediapipe' || !Array.isArray(value.windows)) return null;
  const windows = value.windows.slice(0, 90).flatMap(window => {
    if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start < 0 || window.end <= window.start || window.end > 86400) return [];
    const metrics = Object.fromEntries(Object.keys(VISUAL_METRICS).filter(key => Number.isFinite(window.metrics?.[key]) && window.metrics[key] >= 0 && window.metrics[key] <= 10).map(key => [key, Number(window.metrics[key].toFixed(4))]));
    const observations = Object.fromEntries(['faceX','faceY','faceSize','luminance'].filter(key => Number.isFinite(window.observations?.[key]) && window.observations[key] >= 0 && window.observations[key] <= 1).map(key => [key, Number(window.observations[key].toFixed(4))]));
    if (!Object.keys(metrics).length && !Object.keys(observations).length) return [];
    return [{ start: window.start, end: window.end, metrics, observations, coverage: Math.max(0, Math.min(1, Number(window.coverage) || 0)) }];
  });
  return { source: 'device-mediapipe', version: 1, rawVideoStored: false, windows };
}
