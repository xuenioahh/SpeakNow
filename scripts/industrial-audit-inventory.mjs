import './load-server-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const output = 'docs/industrial-audit-2026-11-10';
const skip = new Set(['node_modules', '.git', '.cache', '.local-asr', 'data', 'dist', 'docs', '.vercel']);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith('.env')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file); else if (entry.isFile()) files.push(file);
  }
}
walk('.');
const sources = files.filter(file => /\.(jsx?|mjs|sql|json)$/.test(file) && !file.endsWith('package-lock.json') && !file.startsWith('public/'));
const names = new Set();
for (const file of sources) for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
const apis = files.filter(file => /^api\/[^_][^/]+\.js$/.test(file)).map(file => {
  const text = fs.readFileSync(file, 'utf8');
  return { file, dependencies: [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]), boundary: /export default trialApi/.test(text) ? 'authenticated or rate-limited anonymous inference' : /export default protectedApi/.test(text) ? 'authenticated API' : file.includes('local-transcription') ? 'loopback/local-ASR gate plus optional session authentication' : file.includes('voice-capabilities') ? 'public capability metadata' : 'inspect per-action authentication' };
});
const baseline = JSON.parse(fs.readFileSync(`${output}/baseline-files.json`));
const hashes = new Map(baseline.files.map(entry => [entry.file, entry.sha256]));
const changed = files.filter(file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hashes.get(file));
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
const inventory = {
  capturedAt: new Date().toISOString(), projectRoot: process.cwd(), gitState: 'Untracked project under home repository; no commit or branch created',
  lockfileVersion: lock.lockfileVersion, files, apiRoutes: apis,
  environment: [...names].sort().map(name => ({ name, configuredInAuditShell: Boolean(process.env[name]) })),
  versions: Object.fromEntries(['react', 'vite', 'three', '@mediapipe/tasks-vision', 'microsoft-cognitiveservices-speech-sdk', 'typescript'].map(name => [name, lock.packages[`node_modules/${name}`]?.version])),
  physicalDevices: 'See physical-camera.json; microphone recognition/playback not accepted from mock tests',
  localAsrAssets: { interpreter: fs.existsSync('.local-asr/venv/bin/python'), model: fs.existsSync('.local-asr/model/model.bin') },
  changedFiles: changed,
};
const secretKeys = ['DEEPSEEK_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AZURE_SPEECH_KEY', 'ELEVENLABS_API_KEY'];
const matches = [];
function scan(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.isFile() && /\.(jsx?|mjs|json|html|map)$/.test(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const name of secretKeys) if (process.env[name]?.length > 12 && content.includes(process.env[name])) matches.push({ file, keyName: name });
    }
  }
}
for (const directory of ['src', 'public', 'dist']) scan(directory);
inventory.secretScan = { scope: 'Exact configured secret values in frontend source, public and built text assets; not a complete historical credential scan', matches };
fs.writeFileSync(`${output}/inventory.json`, JSON.stringify(inventory, null, 2));
const before = JSON.parse(fs.readFileSync('/private/tmp/speaknow-audit-20261110-before/package-lock.json'));
const changes = Object.entries(lock.packages).filter(([name, value]) => value.version !== before.packages[name]?.version).map(([name, value]) => ({ name, before: before.packages[name]?.version, after: value.version }));
fs.writeFileSync(`${output}/dependency-changes.json`, JSON.stringify(changes, null, 2));
console.log(JSON.stringify({ sourceFiles: sources.length, apiRoutes: apis.length, environmentNames: names.size, changedFiles: changed.length, configuredSecretMatches: matches.length, dependencyChanges: changes.length }));
