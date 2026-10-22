import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory } from './_jsonStore.js';
const remote = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && !/^(1|true|yes)$/i.test(process.env.FORCE_LOCAL_DATA || '');
export async function mediaObject(key, { method = 'GET', data, mime } = {}) {
  if (!/^[\w-]+\/[\w-]+\/[\w-]+$/.test(key)) throw new Error('Invalid media path');
  if (remote()) {
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/speaknow-recordings/${key}`, { method, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, ...(mime ? { 'Content-Type': mime } : {}) }, body: data, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Object.assign(new Error('Private recording storage is unavailable.'), { status: 503 });
    return method === 'GET' ? Buffer.from(await response.arrayBuffer()) : null;
  }
  const file = path.join(dataDirectory(), 'recordings', key);
  if (method === 'POST') {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
      // Publish complete bytes atomically, without replacing a concurrent upload.
      await fs.link(temporary, file);
    } finally { await fs.unlink(temporary).catch(() => {}); }
    return null;
  }
  if (method === 'DELETE') { await fs.unlink(file).catch(() => {}); return null; }
  return fs.readFile(file);
}
