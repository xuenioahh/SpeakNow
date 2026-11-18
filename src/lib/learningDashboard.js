// Pure views of existing records. No derived view writes or copies a practice.
const seconds = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function mergeLearningRecords({ attempts = [], voiceSessions = [], presentations = [], ownerId = null } = {}) {
  const map = new Map();
  const putAttempt = (attempt, remote = false) => {
    if (!attempt?.id || attempt.ownerId && attempt.ownerId !== ownerId) return;
    const old = map.get(attempt.id)?.attempt;
    const value = { ...old, ...attempt };
    const recorded = (value.answers || []).filter(answer => answer.recordingId).map(answer => seconds(answer.durationSeconds)).filter(Boolean);
    map.set(value.id, { id: value.id, exam: value.exam || (value.track === 'daily' ? 'daily' : 'unknown'), title: value.title || value.taskId,
      date: value.createdAt, seconds: recorded.length ? recorded.reduce((sum, n) => sum + n, 0) : null,
      completed: value.completed !== false, kind: 'learning', parentId: value.parentId || null, taskId: value.taskId,
      href: `/practice/review?id=${value.id}`, attempt: value, source: remote ? 'Account' : 'This device' });
  };
  attempts.forEach(attempt => { if (!attempt.ownerId || attempt.ownerId === ownerId) putAttempt(attempt); });
  for (const session of voiceSessions) {
    if (session.report?.learning) { putAttempt({ ...session.report.learning, ownerId }, true); continue; }
    map.set(session.id, { id: session.id, exam: session.scoring_standard || 'daily', title: session.scenario || 'Conversation', date: session.created_date,
      seconds: seconds(session.duration_seconds), completed: true, kind: 'legacy-voice', parentId: null, taskId: session.scenario,
      href: `/progress?tab=history&record=${session.id}`, legacy: session, source: 'Account' });
  }
  for (const session of presentations) map.set(session.id, { id: session.id, exam: 'presentation', title: session.file_name || session.scenario || 'Presentation', date: session.created_date,
    seconds: seconds(session.duration_seconds), completed: true, kind: 'presentation', parentId: session.report?.impact?.parentId || null, taskId: 'presentation',
    href: session.report?.impact ? `/presentation/report?session=${session.id}` : `/progress?tab=history&record=${session.id}`, legacy: session, source: 'Account' });
  return [...map.values()].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}
export function learningInsights(records, now = Date.now()) {
  const valid = records.filter(record => Number.isFinite(Date.parse(record.date)) && Date.parse(record.date) <= now);
  const counts = Object.fromEntries(['toefl', 'ielts', 'daily', 'presentation'].map(exam => [exam, valid.filter(record => record.exam === exam).length]));
  const durations = valid.map(record => record.seconds).filter(value => Number.isFinite(value) && value > 0);
  const byId = new Map(valid.map(record => [record.id, record]));
  const pairs = valid.flatMap(record => {
    const parent = byId.get(record.parentId);
    if (!parent?.attempt || !record.attempt || parent.taskId !== record.taskId) return [];
    const answers = record.attempt.answers.flatMap(answer => {
      const before = parent.attempt.answers.find(item => item.questionIndex === answer.questionIndex && item.prompt === answer.prompt);
      return before ? [{ questionIndex: answer.questionIndex, before: before.text, after: answer.text, changed: before.text !== answer.text }] : [];
    });
    return answers.length ? [{ id: record.id, parentId: parent.id, title: record.title, answers, href: record.href }] : [];
  });
  const evidence = valid.flatMap(record => (record.attempt?.feedback?.improvements || []).filter(item => item.quote?.trim() && record.attempt.answers[item.answerIndex]?.text?.includes(item.quote)).map(item => ({ ...item, id: record.id, title: record.title, href: record.href })));
  const focuses = new Map();
  for (const item of evidence) {
    const text = `${item.reason} ${item.suggestion}`.toLowerCase();
    const category = /gramma|tense|article|verb|sentence/.test(text) ? 'Grammar' : /vocab|word|lexic|phrase/.test(text) ? 'Vocabulary' : /reason|example|develop|detail|coher|idea/.test(text) ? 'Developing ideas' : 'Answer structure';
    focuses.set(category, (focuses.get(category) || 0) + 1);
  }
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index);
    const end = new Date(date); end.setDate(end.getDate() + 1);
    return { label: date.toLocaleDateString('en', { weekday: 'short' }), count: valid.filter(record => Date.parse(record.date) >= +date && Date.parse(record.date) < +end).length };
  });
  return { total: valid.length, counts, seconds: durations.length ? durations.reduce((sum, n) => sum + n, 0) : null, timedCount: durations.length,
    recent: valid.slice(0, 4), week, pairs, focuses: [...focuses].sort((a, b) => b[1] - a[1]), next: evidence[0] || null, evidenceCount: evidence.length };
}
