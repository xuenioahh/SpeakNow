import fs from 'node:fs';
import path from 'node:path';

for (const filename of ['.env.local', '.env']) {
  const file = path.resolve(filename);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const separator = value.indexOf('=');
    if (separator < 1) continue;
    const key = value.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || key in process.env) continue;
    process.env[key] = value.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
