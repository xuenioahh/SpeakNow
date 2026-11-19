import { closeMongo } from '../api/_mongoStore.js';
import { checkStorageHealth } from '../api/_storageHealth.js';
if (process.env.VERCEL_ENV === 'production' || process.argv.includes('--check')) {
  const result = await checkStorageHealth();
  console.log('SPEAKNOW_STORAGE_PREFLIGHT', JSON.stringify(result));
  await closeMongo();
  if (!result.ok) { console.error('Production storage is not ready. Repair the failed database checks before promoting this build.'); process.exitCode = 1; }
}
