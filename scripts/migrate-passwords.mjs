// Hash legacy passwords without changing IDs, sessions or practice records.
// An encrypted recovery snapshot is created for local storage; never print passwords.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';
import { hashPassword } from '../api/_auth.js';
import { readAppStore, saveUser } from '../api/_appStore.js';
import { dataDirectory } from '../api/_jsonStore.js';

const db = await readAppStore();
const legacy = db.users.filter(user => typeof user.password === 'string' && user.password && !user.password.startsWith('scrypt$'));
if (legacy.length && !process.env.SUPABASE_URL) {
  const dir = dataDirectory(); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(db)), cipher.final()]);
  const tag = cipher.getAuthTag(), stamp = Date.now();
  await fs.writeFile(path.join(dir, `migration-${stamp}.key`), key, { mode: 0o600 });
  await fs.writeFile(path.join(dir, `migration-${stamp}.sealed`), Buffer.concat([iv, tag, data]), { mode: 0o600 });
}
for (const user of legacy) await saveUser({ ...user, password: await hashPassword(user.password) });
console.log(JSON.stringify({ migratedAccounts: legacy.length, preservedUserIds: true, preservedPracticeData: true, plaintextPrinted: false }));
