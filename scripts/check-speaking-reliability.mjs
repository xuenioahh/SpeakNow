import './load-server-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { SCENARIOS } from '../src/lib/scenarios.js';
import { getDailyTasks } from '../src/lib/dailyTasks.js';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-reliability-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5220';
const { default: feedback } = await import('../api/speaking-feedback.js');
const results = [];
const response = () => ({ code: 200, headers: {}, headersSent: false, chunks: [], setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; this.headersSent = true; }, flushHeaders() {}, on() {}, off() {}, write(chunk) { this.headersSent = true; this.chunks.push(chunk); }, end() { this.headersSent = true; } });
async function call(name, body) {
  const res = response(), start = Date.now();
  try {
    await feedback({ method: 'POST', url: '/api/speaking-feedback', headers: { host: 'localhost:5220', origin: 'http://localhost:5220', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' }, body, on() {} }, res);
    const stream = res.chunks.join(''), ok = res.code === 200 && (body.action === 'conversation_stream' ? /event: done\n/.test(stream) && !/event: error\n/.test(stream) : res.value?.source === 'ai');
    const item = { name, ok, httpStatus: res.code, elapsedMs: Date.now() - start, code: res.value?.code || (stream.match(/"code":"([^"]+)"/) || [])[1] || null };
    results.push(item); console.log(JSON.stringify(item));
    return res;
  } catch (error) { const item = { name, ok: false, elapsedMs: Date.now() - start, code: error.code || 'connection_failed' }; results.push(item); console.log(JSON.stringify(item)); }
}
for (const sceneId of ['cafe','hotel','airport']) {
  const scenario = SCENARIOS.find(item => item.id === sceneId), task = getDailyTasks(scenario)[0], sessionId = randomUUID();
  let history = [{ role: 'ai', content: task.conversation.firstMessage }];
  for (let turn = 1; turn <= 2; turn++) {
    const words = turn === 1 ? `Hello. I would like some help with ${sceneId === 'cafe' ? 'ordering a drink' : sceneId === 'hotel' ? 'checking in for two nights' : 'finding my departure gate'}.` : 'Could you explain the options and what you would recommend?';
    const res = await call(`conversation:${sceneId}:${turn}`, { action: 'conversation_stream', scenario, sceneCueId: task.id, sessionId, turnId: `turn-${turn}`, history, userText: words, mode: 'basic' });
    const done = res?.chunks?.join('').split('\n\n').find(event => event.startsWith('event: done'));
    if (done) { const value = JSON.parse(done.split('\ndata: ')[1]); history = [...history, { role: 'user', content: words }, { role: 'ai', content: value.reply }]; }
  }
}
for (let round = 1; round <= 2; round++) for (const task of [{ name: 'TOEFL', track: 'exam', taskId: 'toefl-interview-campus-v1' }, { name: 'IELTS', track: 'exam', taskId: 'ielts-part1-study-v1' }, { name: 'Daily', track: 'daily', taskId: 'daily' }]) {
  await call(`feedback:${task.name}:${round}`, { attempt: { id: randomUUID(), ...task, answers: [{ questionIndex: 0, text: 'I prefer studying in the morning because the library is quiet. Last week I finished my engineering project there before my afternoon classes.', inputMode: 'text' }] } });
}
const summary = { liveProvider: true, testInput: 'synthetic text; no user recording uploaded', total: results.length, successful: results.filter(result => result.ok).length, results, note: 'Observed sample, not a guarantee of future provider availability.' };
await fs.mkdir('docs/ui-restoration-2026-10-31', { recursive: true });
await fs.writeFile('docs/ui-restoration-2026-10-31/live-reliability.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ total: summary.total, successful: summary.successful }));
if (summary.successful !== summary.total) process.exitCode = 1;
