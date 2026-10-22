import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function dataDirectory() {
  if ((process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) && !process.env.SPEAKNOW_DATA_DIR) throw Object.assign(new Error('Persistent storage is required; apply the Supabase consolidation migration.'), { status: 503 });
  return process.env.SPEAKNOW_DATA_DIR || path.join(process.cwd(), 'data');
}
export async function readJson(name, empty) {
  const file = path.join(dataDirectory(), name);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return structuredClone(empty);
    throw Object.assign(new Error(`Stored ${name} is unreadable. Original data was preserved; restore a verified backup.`), { status: 503 });
  }
}
export async function mutateJson(name, empty, mutate) {
  const dir = dataDirectory(); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, name), lock = `${file}.lock`;
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { handle = await fs.open(lock, 'wx', 0o600); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 30)); }
  }
  if (!handle) throw Object.assign(new Error('Storage is busy. Retry; do not remove an active storage lock.'), { status: 503 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const value = await readJson(name, empty);
    const next = await mutate(value) || value;
    await fs.writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await fs.rename(temporary, file);
    return next;
  } finally { await handle.close(); await fs.unlink(lock); await fs.unlink(temporary).catch(() => {}); }
}
