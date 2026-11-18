import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const root = process.cwd();
let worker;
const pending = new Map();
export function localTranscriptionAvailable() {
  return process.env.SPEAKNOW_LOCAL_ASR === 'true' && process.env.FORCE_LOCAL_DATA === 'true' && !process.env.VERCEL &&
    fs.existsSync(path.join(root, '.local-asr/venv/bin/python')) && fs.existsSync(path.join(root, '.local-asr/model/model.bin'));
}
const unavailable = () => Object.assign(new Error('Audio transcription is unavailable. Your recording is saved; retry transcription.'), { status: 503, code: 'transcription_unavailable' });
function ensureWorker() {
  if (worker) return worker;
  const child = spawn(path.join(root, '.local-asr/venv/bin/python'), ['-u', path.join(root, 'scripts/local-transcription-worker.py'), path.join(root, '.local-asr/model')], {
    cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  worker = child;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    const job = pending.get(value.id);
    if (!job || job.child !== child) return;
    if (value.error) job.reject(unavailable()); else job.resolve(value.result);
  });
  child.stderr.on('data', () => {}); // Model diagnostics may contain local paths; never echo audio.
  const fail = () => {
    if (worker === child) worker = null;
    for (const job of pending.values()) if (job.child === child) job.reject(unavailable());
    lines.close();
  };
  child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail);
  return child;
}
export function transcribeLocalAudio(data, { signal } = {}) {
  if (!localTranscriptionAvailable()) return Promise.reject(unavailable());
  if (pending.size) return Promise.reject(Object.assign(new Error('Another recording is being transcribed. Retry in a moment.'), { status: 429 }));
  const child = ensureWorker(), id = randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); fn(value); };
    const abort = () => { child.kill(); finish(reject, Object.assign(new Error('Transcription cancelled. Your recording is saved.'), { status: 499 })); };
    const timer = setTimeout(() => { child.kill(); finish(reject, unavailable()); }, 90000);
    pending.set(id, { child, resolve: value => finish(resolve, value), reject: error => finish(reject, error) });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    child.stdin.write(JSON.stringify({ id, data }) + '\n');
  });
}
