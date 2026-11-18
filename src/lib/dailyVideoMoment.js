export function selectLearningMoment(clips, windows, answers) {
  return clips.filter(clip => clip.hasAudio && clip.blob?.size > 0 && clip.end - clip.start >= 5 && clip.end - clip.start <= 10).map(clip => {
    const window = windows.find(item => item.start < clip.end && item.end > clip.start && item.coverage >= 0.5 && item.text.trim());
    const speaking = answers.some(answer => Number.isFinite(answer.startSeconds) && answer.startSeconds < clip.end && answer.startSeconds + answer.durationSeconds > clip.start);
    const offCenter = window && Number.isFinite(window.observations?.faceX) && (window.observations.faceX < .2 || window.observations.faceX > .8);
    const handMotion = window && Number.isFinite(window.metrics?.hands) && window.metrics.hands >= .12;
    const headMotion = window && Number.isFinite(window.metrics?.head) && window.metrics.head >= .08;
    return { clip, window, offCenter, priority: speaking && window ? offCenter ? 3 : handMotion ? 2 : headMotion ? 1 : 0 : 0,
      reason: offCenter ? 'framing' : handMotion ? 'hand movement' : headMotion ? 'head movement' : null };
  }).filter(item => item.priority > 0).sort((a, b) => b.priority - a.priority || b.window.coverage - a.window.coverage)[0] || null;
}
