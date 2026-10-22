const SCALES = { ielts: 9, toefl: 6, daily: 10, presentation: 10 };
const LABELS = { ielts: "IELTS practice", toefl: "TOEFL practice", daily: "Daily speaking", presentation: "Presentation" };
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const round = n => n === null ? null : Math.round(n * 10) / 10;
const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const numeric = value => (typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null;

export function metricLabel(name) {
  return String(name).replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function buildProfileAnalytics({ voiceSessions = [], presentationSessions = [], days = 30, track = "all", now = new Date() } = {}) {
  const records = [
    ...voiceSessions.map(s => ({ ...s, kind: "voice" })),
    ...presentationSessions.map(s => ({ ...s, kind: "presentation" })),
  ].filter(s => s && Number.isFinite(new Date(s.created_date).getTime()) && new Date(s.created_date) <= now)
    .sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const selected = records.filter(s => new Date(s.created_date) >= start && (track === "all" || s.kind === track));
  const groups = Object.entries(SCALES).map(([id, max]) => {
    const sessions = selected.filter(s => (s.kind === "presentation" ? "presentation" : s.scoring_standard) === id);
    const scored = sessions.flatMap(s => {
      const report = s.report || {};
      const raw = numeric(id === "presentation" ? report.overall_score : report.totalScore);
      if ((report.source !== "measured") || report.fallback_reason || raw === null || raw < 0 || raw > max) return [];
      return [{ session: s, value: raw, percent: raw / max * 100 }];
    });
    const count = Math.min(3, Math.floor(scored.length / 2));
    const recent = count >= 2 ? mean(scored.slice(-count).map(s => s.value)) : null;
    const previous = count >= 2 ? mean(scored.slice(-count * 2, -count).map(s => s.value)) : null;
    const metricValues = new Map();
    scored.forEach(({ session }) => {
      Object.entries(session.report?.scores || {}).forEach(([name, value]) => {
        const n = numeric(value);
        if (n === null || n < 0 || n > max) return;
        if (!metricValues.has(name)) metricValues.set(name, []);
        metricValues.get(name).push(n);
      });
    });
    const metrics = [...metricValues].map(([name, values]) => ({ name, label: metricLabel(name), value: round(mean(values)), percent: mean(values) / max * 100, count: values.length }))
      .sort((a, b) => a.value - b.value);
    return { id, label: LABELS[id], max, count: scored.length, average: round(mean(scored.map(s => s.value))), delta: recent === null ? null : round(recent - previous), comparisonCount: count, metrics,
      points: scored.map(({ session, value, percent }) => ({ id: session.id, date: session.created_date, value, percent })) };
  }).filter(g => g.count > 0);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 6 + i);
    const sessions = records.filter(s => dayKey(new Date(s.created_date)) === dayKey(date));
    return { date, label: date.toLocaleDateString("en", { weekday: "short" }), count: sessions.length };
  });
  const activeDays = new Set(records.map(s => dayKey(new Date(s.created_date))));
  const cursor = new Date(now);
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDays.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  const seconds = selected.reduce((total, s) => total + Math.max(0, numeric(s.duration_seconds) || 0), 0);
  const advice = groups.map(group => {
    const weakest = group.metrics[0];
    const metric = weakest?.name?.toLowerCase() || "";
    let action = "Repeat the same task, then compare your next saved report.";
    if (/fluency|delivery/.test(metric)) action = "Rehearse a 60-second answer. Pause between ideas, then repeat once without restarting.";
    if (/grammar/.test(metric)) action = "Choose two sentences from your last report, correct them, then use each in a new answer.";
    if (/lexical|vocab/.test(metric)) action = "Pick three topic-specific words. Use each in an answer with a reason and example.";
    if (/pronunciation/.test(metric)) action = "Record a short paragraph and listen back for stressed words. Text-based scores cannot establish your accent or pronunciation accuracy.";
    if (/content|document/.test(metric)) action = "Summarize one slide in a single sentence, then add one supporting example.";
    if (/body|engagement/.test(metric)) action = "Rehearse your opening with a clear audience question and review your own recording.";
    return { group: group.id, title: weakest ? `Work on ${weakest.label.toLowerCase()}` : `Continue ${group.label.toLowerCase()}`, evidence: weakest ? `${group.label}: ${weakest.value}/${group.max} across ${weakest.count} scored session${weakest.count === 1 ? "" : "s"}.` : `${group.count} scored sessions in this period.`, action, href: group.id === "presentation" ? "/presentation" : "/voice", provisional: group.count < 3 };
  });
  const scoredCount = groups.reduce((n, g) => n + g.count, 0);
  return { total: selected.length, lifetimeTotal: records.length, minutes: Math.round(seconds / 60), averageMinutes: selected.length ? round(seconds / 60 / selected.length) : null,
    voiceCount: selected.filter(s => s.kind === "voice").length, presentationCount: selected.filter(s => s.kind === "presentation").length,
    groups, advice, week, weekCount: week.reduce((n, d) => n + d.count, 0), streak, excludedScores: selected.length - scoredCount,
    recent: [...selected].reverse().slice(0, 5), invalidDates: voiceSessions.length + presentationSessions.length - records.length };
}
