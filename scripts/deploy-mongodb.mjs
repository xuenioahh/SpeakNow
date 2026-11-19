// Database preflight only by default. --stage writes four settings to the linked
// Vercel project's production environment and builds a candidate WITHOUT moving
// the production domain. Promote only after the candidate's online checks pass.
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { checkMongoHealth, closeMongo } from '../api/_mongoStore.js';

if (process.argv.includes('--help')) {
  console.log('node scripts/deploy-mongodb.mjs [--stage]\nReads .env.mongodb.local; never prints credentials. Set VERCEL_CLI_PATH if vercel is not on PATH.');
  process.exit(0);
}
try { process.loadEnvFile('.env.mongodb.local'); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read .env.mongodb.local.'); }
process.env.SPEAKNOW_STORAGE_PROVIDER = 'mongodb';
process.env.FORCE_LOCAL_DATA = 'false';
const result = await checkMongoHealth();
await closeMongo();
console.log(JSON.stringify(result));
if (!result.ok) {
  console.error('MongoDB is not ready. Set MONGODB_URI and MONGODB_DB in .env.mongodb.local; check the Atlas database user and network access. No Vercel settings or deployments were changed.');
  process.exit(1);
}
if (!process.argv.includes('--stage')) process.exit(0);
const settings = {
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  FORCE_LOCAL_DATA: 'false',
  SPEAKNOW_STORAGE_PROVIDER: 'mongodb',
};
const cli = process.env.VERCEL_CLI_PATH;
const command = cli ? process.execPath : 'vercel';
const prefix = cli ? [cli] : [];
async function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    // Suppress provider diagnostics here: connection strings must never appear
    // in a deployment log, even if a CLI version unexpectedly echoes stdin.
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Vercel CLI could not start. Check VERCEL_CLI_PATH.')));
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Vercel ${args[0]} failed (exit ${code}). No domain promotion was performed.`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? undefined : input + '\n');
  });
}
// Verify the linked project before changing its configuration.
await run(['project', 'inspect']);
for (const [key, value] of Object.entries(settings)) {
  await run(['env', 'add', key, 'production', '--force', '--yes', key === 'MONGODB_URI' ? '--sensitive' : '--no-sensitive'], value);
  console.log(`Configured ${key}`);
}
const deployment = await run(['deploy', '--prod', '--skip-domain', '--yes']);
const candidate = deployment.match(/https:\/\/[a-z0-9-]+\.vercel\.app\b/)?.[0];
if (!candidate) throw new Error('Candidate command completed without a recognizable URL. Inspect Vercel before continuing.');
const directory = 'docs/mongodb-2026-11-18';
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(`${directory}/candidate.json`, JSON.stringify({ candidate, createdAt: new Date().toISOString(), promoted: false, storage: 'mongodb' }, null, 2));
console.log(`Candidate built: ${candidate}\nProduction domain has not been promoted. Verify registration, login, practice save/reload, membership and private media before promotion.`);
