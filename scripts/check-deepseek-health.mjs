// Run with DEEPSEEK_API_KEY in the server environment. Never prints credentials.
import './load-server-env.mjs';
import { checkProviderHealth } from '../api/_llm.js';

try {
  const result = await checkProviderHealth({ probe: true });
  console.log(JSON.stringify(result));
  if (!result.configured || result.authentication !== 'verified' || result.balance === 'insufficient' || result.model !== 'available') process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ provider: 'deepseek', configured: Boolean(process.env.DEEPSEEK_API_KEY), status: 'failed', code: error.code || 'connection_failed', httpStatus: error.status || null }));
  process.exitCode = 1;
}
