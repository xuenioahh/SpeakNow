import fs from 'node:fs/promises';
import path from 'node:path';
import { fixedAudioCatalog } from './fixed-audio-catalog.mjs';

const expected = fixedAudioCatalog();
const manifest = JSON.parse(await fs.readFile('public/fixed-audio/manifest.json', 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('Fixed audio manifest is invalid.');
const byId = new Map();
for (const entry of manifest.entries) {
  if (!entry?.audioId || byId.has(entry.audioId)) throw new Error('Fixed audio manifest has a missing or duplicate ID.');
  byId.set(entry.audioId, entry);
}
const missing = [], stale = [], invalid = [];
for (const item of expected) {
  const entry = byId.get(item.audioId);
  if (!entry) { missing.push(item.audioId); continue; }
  if (entry.textHash !== item.textHash) { stale.push(item.audioId); continue; }
  if (entry.generationStatus !== 'ready' || entry.provider !== 'elevenlabs' || !entry.model || !entry.voiceId || !Number.isFinite(entry.duration) || entry.duration <= 0 || !/^\/fixed-audio\/v\d+\/[a-zA-Z0-9-]+\.mp3$/.test(entry.audioUrl)) { invalid.push(item.audioId); continue; }
  try { const file = await fs.stat(path.join('public', entry.audioUrl)); if (!file.isFile() || file.size < 1000) invalid.push(item.audioId); }
  catch { invalid.push(item.audioId); }
}
console.log(JSON.stringify({ total: expected.length, ready: expected.length - missing.length - stale.length - invalid.length, missing: missing.length, stale: stale.length, invalid: invalid.length, extra: [...byId.keys()].filter(id => !expected.some(item => item.audioId === id)).length }));
if (stale.length || invalid.length) process.exitCode = 1;
