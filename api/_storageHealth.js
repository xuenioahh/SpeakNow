// Read schema and call only no-op/validation paths. Never return rows or keys.
export async function checkStorageHealth({ env = process.env, fetcher = fetch } = {}) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /^(true|1|yes)$/i.test(env.FORCE_LOCAL_DATA || '')) return { ok: false, checks: [{ resource: 'configuration', ok: false, code: !url || !key ? 'missing_configuration' : 'local_storage_enabled' }] };
  const specs = [
    ['app_users', 'id,profile_preferences'], ['app_voice_sessions', 'id'], ['app_presentation_sessions', 'id'], ['app_activity_records', 'id'], ['app_settings', 'key'],
    ['app_auth_sessions', 'id,csrf_hash,expires_at'], ['app_usage_counters', 'key,count,until_at'], ['app_api_usage', 'id,created_date'], ['app_memberships', 'user_id'], ['app_usage_ledgers', 'user_id,state,revision'],
  ].map(([resource, columns]) => ({ resource, query: `?select=${columns}&limit=0` }));
  specs.push(
    { resource: 'rpc/speaknow_consume_limit', body: { counter_key: 'deployment-schema-check', counter_limit: 0, window_ms: 1, increment_by: 0 }, expected: 'false' },
    { resource: 'rpc/speaknow_release_limit', body: { counter_key: 'deployment-schema-check', decrement_by: 0 } },
    { resource: 'rpc/speaknow_commit_usage', body: { owner_id: null, expected_revision: -1, next_state: {} }, expectedError: 'P0001' },
  );
  const checks = await Promise.all(specs.map(async spec => {
    try {
      const response = await fetcher(`${url}/rest/v1/${spec.resource}${spec.query || ''}`, { method: spec.body ? 'POST' : 'GET', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: spec.body ? JSON.stringify(spec.body) : undefined, signal: AbortSignal.timeout(10000) });
      const raw = await response.text(); let result; try { result = JSON.parse(raw); } catch { result = null; }
      const ok = spec.expectedError ? result?.code === spec.expectedError && result?.message === 'invalid_usage' : response.ok && (spec.expected === undefined || raw === spec.expected);
      return { resource: spec.resource, ok, status: response.status, code: ok ? 'ok' : typeof result?.code === 'string' ? result.code.slice(0,30) : 'unexpected_response' };
    } catch { return { resource: spec.resource, ok: false, code: 'connection_failed' }; }
  }));
  return { ok: checks.every(check => check.ok), checks };
}
