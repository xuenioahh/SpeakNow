// Read local server configuration without printing keys. --balance performs only
// the official DeepSeek balance lookup; no completion requests or top-ups.
import fs from 'node:fs';
import { expressionServiceStatus } from '../api/_llm.js';
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
console.log(JSON.stringify({ scope: 'local environment only', ...expressionServiceStatus() }, null, 2));
if (process.argv.includes('--balance')) {
  if (!process.env.DEEPSEEK_API_KEY) console.log('DeepSeek balance: not checked; DEEPSEEK_API_KEY is not configured locally.');
  else {
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      console.log(JSON.stringify({ deepseekAvailable: data.is_available, balance: (data.balance_infos || []).map(b => ({ currency: b.currency, total: b.total_balance })) }, null, 2));
    } catch (error) { console.error(`DeepSeek balance could not be checked: ${error.message}`); process.exitCode = 1; }
  }
}
