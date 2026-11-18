import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileAnalytics } from '../../src/lib/profileAnalytics.js';
import { buildProfileVoiceSessions } from '../../src/lib/profileRecords.js';

test('profile counts saved sessions but averages only recorded positive durations', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const result = buildProfileAnalytics({
    now,
    voiceSessions: [
      { id: 'one', created_date: '2026-10-25T09:00:00Z', duration_seconds: 120, report: { source: 'heuristic', totalScore: 9 }, scoring_standard: 'daily' },
      { id: 'two', created_date: '2026-10-25T10:00:00Z', duration_seconds: null },
      { id: 'three', created_date: '2026-10-26T09:00:00Z', duration_seconds: 60 },
      { id: 'invalid', created_date: null, duration_seconds: 600 },
    ],
    presentationSessions: [{ id: 'four', created_date: '2026-10-26T10:00:00Z', duration_seconds: 0 }],
  });
  assert.equal(result.total, 4);
  assert.equal(result.timedCount, 2);
  assert.equal(result.minutes, 3);
  assert.equal(result.averageMinutes, 1.5);
  assert.equal(result.practiceDays, 2);
  assert.equal(result.invalidDates, 1);
  assert.equal(result.groups.length, 0);
});

test('profile leaves duration unavailable when no session has recorded time', () => {
  const result = buildProfileAnalytics({
    now: new Date('2026-10-26T12:00:00Z'),
    voiceSessions: [{ id: 'one', created_date: '2026-10-25T09:00:00Z' }],
  });
  assert.equal(result.minutes, null);
  assert.equal(result.averageMinutes, null);
  assert.equal(result.timedCount, 0);
});

test('profile includes current learning attempts once and uses only recorded audio duration', () => {
  const attempt = { id: 'daily-one', ownerId: 'user-one', track: 'daily', title: 'Café · Ordering', createdAt: '2026-10-25T09:00:00Z', answers: [
    { text: 'A coffee please', recordingId: 'audio-one', durationSeconds: 15 },
    { text: 'Make it iced', inputMode: 'text', durationSeconds: 40 },
  ] };
  const sessions = buildProfileVoiceSessions({
    userId: 'user-one',
    savedVoiceSessions: [
      { id: 'daily-one', created_date: '2026-10-25T09:01:00Z', report: { learning: attempt } },
      { id: 'legacy-one', created_date: '2026-10-24T09:00:00Z', duration_seconds: 60 },
    ],
    deviceAttempts: [attempt, { id: 'another-user', ownerId: 'user-two', answers: [] }],
  });
  assert.equal(sessions.length, 2);
  const daily = sessions.find(session => session.id === 'daily-one');
  assert.equal(daily.duration_seconds, 15);
  assert.equal(daily.learning, true);
  assert.equal(daily.scenario, 'Café · Ordering');
  assert.equal(daily.report.source, 'unavailable');
});
