// Only observable, timestamped events can be used for delivery feedback.
// Raw images, video and landmark coordinates never enter the model request.
export const DAILY_EVENT_LABELS = {
  'head-left': 'Head turned left', 'head-right': 'Head turned right',
  'head-down': 'Head direction moved downward', 'head-up': 'Head direction moved upward',
  'head-tilt': 'Head tilted', 'gaze-away': 'Iris direction shifted to the side',
  'body-lean': 'Visible upper body leaned', 'head-body-offset': 'Head position shifted relative to shoulders',
  'shoulder-tilt': 'Shoulder alignment changed', 'hand-activity': 'Visible hand movement increased',
  'facial-activity': 'Visible facial movement changed', 'frame-edge': 'Face was near the frame edge',
  'low-light': 'Camera image was dark', 'low-detail': 'Camera image contained little visible detail',
  'face-missing': 'Face landmarks were unavailable', 'frame-cropped': 'Visible landmarks approached the image boundary',
  'camera-close': 'Face occupied a large part of the frame', 'camera-far': 'Face occupied a small part of the frame',
  'head-posture-stable': 'Head direction and visible shoulder alignment stayed relatively stable',
  pause: 'Microphone activity contained a pause',
};

export function validateDailyEvidence(input, answers) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.slice(0, 120).flatMap(item => {
    const answer = answers[item?.answerIndex];
    if (!answer || !DAILY_EVENT_LABELS[item.kind] || answer.turnId !== item.turnId ||
      !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > 86400 ||
      typeof item.quote !== 'string' || !item.quote.trim() || !answer.text.includes(item.quote)) return [];
    if (item.kind === 'pause' && (answer.inputMode !== 'voice' || !answer.recordingId)) return [];
    if (Number.isFinite(answer.startSeconds) && answer.durationSeconds > 0 &&
      (item.end < answer.startSeconds || item.start > answer.startSeconds + answer.durationSeconds)) return [];
    const id = `${item.kind}:${item.turnId}:${item.start.toFixed(2)}:${item.end.toFixed(2)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, kind: item.kind, label: DAILY_EVENT_LABELS[item.kind],
      answerIndex: item.answerIndex, turnId: answer.turnId, start: item.start, end: item.end,
      quote: item.quote.slice(0,1000), modality: item.kind === 'pause' ? 'audio' : 'visual',
      source: item.kind === 'pause' ? 'device microphone activity estimate' : 'device MediaPipe landmark estimate',
      confidence: Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : null,
      limitation: 'Device-reported observation. Co-occurrence does not establish cause, emotion, attention or confidence.' }];
  });
}

export function buildDailyEvidence({ answers, visionTimeline, liveMetrics }) {
  const events = [
    ...(visionTimeline?.events || []).filter(event => event.speaker === 'user'),
    ...(liveMetrics?.timeline || []).filter(event => event.kind === 'pause' && event.duration >= 1),
  ];
  return validateDailyEvidence(events.flatMap(event => {
    const answerIndex = answers.findIndex(answer => answer.turnId === event.turnId);
    if (answerIndex < 0) return [];
    return [{ ...event, answerIndex, quote: answers[answerIndex].text.slice(0,1000) }];
  }), answers);
}

export function alignDailyEvidence(evidence) {
  return evidence.map(item => ({ ...item,
    cooccurring: evidence.filter(other => other.id !== item.id && other.turnId === item.turnId &&
      other.modality !== item.modality && Math.min(other.end,item.end) > Math.max(other.start,item.start)).map(other => other.id),
  }));
}

export function validateDeliveryFeedback(input, attempt) {
  const evidence = validateDailyEvidence(attempt.multimodalEvidence, attempt.answers);
  const blocked = /\b(?:anxious|nervous|confident|confidence|emotion|personality|shy|dishonest|deceptive|pronunciation|intonation|accent)\b/i;
  return (Array.isArray(input) ? input : []).slice(0,3).flatMap(item => {
    if (!Array.isArray(item?.evidenceIds) || !item.evidenceIds.length ||
      typeof item.suggestion !== 'string' || !item.suggestion.trim() ||
      typeof item.exercise !== 'string' || !item.exercise.trim() ||
      blocked.test(item.suggestion+' '+item.exercise)) return [];
    const cited = item.evidenceIds.map(id => evidence.find(event => event.id === id));
    if (cited.some(event => !event) || cited.length > 3) return [];
    return [{ evidence: cited, observation: cited.map(event => event.label).join('; '),
      suggestion: item.suggestion.slice(0,800), exercise: item.exercise.slice(0,800) }];
  });
}
