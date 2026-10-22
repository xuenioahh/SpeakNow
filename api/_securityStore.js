import { readJson, mutateJson } from './_jsonStore.js';

const empty = { sessions: {}, counters: {}, usage: [] };
const remote = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && !/^(1|true)$/i.test(process.env.FORCE_LOCAL_DATA || '');
export async function securityRequest(resource, { method = 'GET', body, query = '' } = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${resource}${query ? `?${query}` : ''}`, {
    method, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Object.assign(new Error('Security storage unavailable. Apply supabase/consolidation.sql; no local fallback is permitted.'), { status: 503 });
  return response.status === 204 ? null : response.json();
}
export async function putSession(id, value) {
  if (remote()) return securityRequest('app_auth_sessions', { method: 'POST', body: { id, ...value } });
  await mutateJson('security-db.json', empty, db => {
    for (const [key, session] of Object.entries(db.sessions)) if (Date.parse(session.expires_at) < Date.now()) delete db.sessions[key];
    db.sessions[id] = value; return db;
  });
}
export async function getSession(id) {
  if (remote()) return (await securityRequest('app_auth_sessions', { query: `id=eq.${encodeURIComponent(id)}&select=*` }))[0] || null;
  return (await readJson('security-db.json', empty)).sessions[id] || null;
}
export async function revokeSession(id) {
  if (remote()) return securityRequest('app_auth_sessions', { method: 'DELETE', query: `id=eq.${encodeURIComponent(id)}` });
  await mutateJson('security-db.json', empty, db => { delete db.sessions[id]; return db; });
}
export async function consumeLimit(key, limit, windowMs, amount = 1) {
  if (remote()) return securityRequest('rpc/speaknow_consume_limit', { method: 'POST', body: { counter_key: key, counter_limit: limit, window_ms: windowMs, increment_by: amount } });
  let allowed = false;
  await mutateJson('security-db.json', empty, db => {
    const now = Date.now();
    for (const [id, counter] of Object.entries(db.counters)) if (counter.until <= now) delete db.counters[id];
    const entry = db.counters[key] || { count: 0, until: now + windowMs };
    allowed = entry.count + amount <= limit;
    if (allowed) entry.count += amount;
    db.counters[key] = entry; return db;
  });
  return allowed;
}
export async function recordUsage(entry) {
  if (remote()) return securityRequest('app_api_usage', { method: 'POST', body: entry });
  await mutateJson('security-db.json', empty, db => { db.usage = [entry, ...db.usage].slice(0, 2000); return db; });
}
