// Local-only, one-shot integration server. Reads and removes a private key file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = process.env.SPEAKNOW_KEY_FILE;
if (!file) throw new Error('SPEAKNOW_KEY_FILE is required.');
if (fs.statSync(file).mode & 0o077) throw new Error('Credential file must be private.');
process.env.DEEPSEEK_API_KEY = fs.readFileSync(file, 'utf8').trim();
fs.unlinkSync(file);
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'speaknow-real-deepseek-'));
process.env.LLM_PROVIDER = 'deepseek';
process.env.SPEAKNOW_DYNAMIC_TTS = 'browser';
process.env.BACKEND_PORT ||= '18894';
process.env.SPEAKNOW_ORIGIN ||= 'http://127.0.0.1:15214';
process.on('SIGINT', () => {
  delete process.env.DEEPSEEK_API_KEY;
  fs.rmSync(process.env.SPEAKNOW_DATA_DIR, { recursive: true, force: true });
  process.exit(0);
});
await import('../backend/server.js');
