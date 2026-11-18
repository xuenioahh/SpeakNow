import fs from 'node:fs/promises';
const env = {};
for (const line of (await fs.readFile('.env.production-audit.local', 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) {
    try { env[match[1]] = JSON.parse(match[2]); }
    catch { env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
  }
}
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DEEPSEEK_API_KEY'].filter(key => !env[key] || env[key] === '[SENSITIVE]');
const report = { scope: 'Read-only production schema inspection; no records returned, no mutation or RPC invocation', localDataEnabled: env.FORCE_LOCAL_DATA === '[SENSITIVE]' ? null : /^(true|1|yes)$/i.test(env.FORCE_LOCAL_DATA || ''), missing, checks: [] };
if (!missing.length) {
  const tables = {
    app_users: 'id,profile_preferences', app_voice_sessions: 'id', app_presentation_sessions: 'id', app_activity_records: 'id', app_settings: 'key',
    app_auth_sessions: 'id,csrf_hash,expires_at', app_usage_counters: 'key,count,until_at', app_api_usage: 'id,created_date', app_memberships: 'user_id', app_usage_ledgers: 'user_id,state,revision',
  };
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  for (const [table, columns] of Object.entries(tables)) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=${columns}&limit=0`, { headers, signal: AbortSignal.timeout(15000) });
      const result = await response.json().catch(() => null);
      report.checks.push({ table, ok: response.ok, status: response.status, code: response.ok ? 'ok' : result?.code || 'unavailable' });
    } catch { report.checks.push({ table, ok: false, code: 'connection_failed' }); }
  }
}
report.ready = !missing.length && !report.localDataEnabled && report.checks.length === 10 && report.checks.every(check => check.ok);
await fs.writeFile('docs/industrial-audit-2026-11-10/production-readonly.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;
