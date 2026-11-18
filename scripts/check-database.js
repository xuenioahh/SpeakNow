import fs from 'node:fs';
import { checkStorageHealth } from '../api/_storageHealth.js';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const report = await checkStorageHealth();
console.log(JSON.stringify(report, null, 2));
console.log('Read-only schema checks and no-op RPC validation. No user records or credentials printed.');
process.exitCode = report.ok ? 0 : 1;
