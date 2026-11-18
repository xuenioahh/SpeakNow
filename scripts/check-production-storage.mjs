import { checkStorageHealth } from '../api/_storageHealth.js';
if (process.env.VERCEL_ENV === 'production' || process.argv.includes('--check')) {
  const result = await checkStorageHealth();
  console.log('SPEAKNOW_STORAGE_PREFLIGHT', JSON.stringify(result));
  if (!result.ok) { console.error('Production storage is not ready. Repair the failed tables/RPCs before promoting this build.'); process.exitCode = 1; }
}
