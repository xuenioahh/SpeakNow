const duration = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;

export function buildProfileVoiceSessions({ savedVoiceSessions = [], deviceAttempts = [], userId = undefined } = {}) {
  const sessions = savedVoiceSessions.filter(row => !row?.report?.learning);
  const attempts = new Map();
  for (const row of savedVoiceSessions) {
    const attempt = row?.report?.learning;
    if (attempt?.id) attempts.set(attempt.id, { ...attempt, savedAt: row.created_date });
  }
  for (const attempt of deviceAttempts) {
    if (!attempt?.id || attempt.ownerId !== userId) continue;
    attempts.set(attempt.id, { ...attempt, savedAt: attempts.get(attempt.id)?.savedAt });
  }
  for (const attempt of attempts.values()) {
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    const recordedSeconds = answers.reduce((sum, answer) => sum + (answer?.recordingId ? duration(answer.durationSeconds) : 0), 0);
    sessions.push({
      id: attempt.id,
      learning: true,
      created_date: attempt.createdAt || attempt.savedAt,
      scenario: attempt.title || attempt.taskId,
      scoring_standard: attempt.track === 'daily' ? 'daily' : attempt.exam,
      duration_seconds: recordedSeconds || null,
      answer_count: answers.length,
      parentId: attempt.parentId || null,
      report: { source: 'unavailable' },
    });
  }
  return sessions;
}
