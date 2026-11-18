import './load-server-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-real-feedback-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5218';
const { default: feedback } = await import('../api/speaking-feedback.js');
const cases = [
  { name: 'TOEFL', track: 'exam', taskId: 'toefl-interview-campus-v1' },
  { name: 'IELTS', track: 'exam', taskId: 'ielts-part1-study-v1' },
  { name: 'Daily', track: 'daily', taskId: 'daily' }
];
const results = [];
for (const item of cases) {
  const attempt = { id: randomUUID(), ...item, answers: [{ questionIndex: 0, inputMode: 'text', text: 'I prefer studying in the morning because the library is quiet. For example, last week I finished my engineering project there before my afternoon classes.' }] };
  const res = { code: 200, headersSent: false, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; this.headersSent = true; } };
  const started = Date.now();
  await feedback({ method: 'POST', url: '/api/speaking-feedback', headers: { host: 'localhost:5218', origin: 'http://localhost:5218', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' }, body: { attempt } }, res);
  results.push({ track: item.name, httpStatus: res.code, elapsedMs: Date.now() - started, source: res.value?.source, model: res.value?.model, improvements: res.value?.improvements?.length, basis: res.value?.basis, code: res.value?.code });
}
console.log(JSON.stringify({ liveProvider: true, syntheticInputText: true, results }, null, 2));
if (results.some(result => result.httpStatus !== 200 || result.source !== 'ai')) process.exitCode = 1;
