import { readJson, mutateJson } from './_jsonStore.js';

const empty = { sessions: {}, counters: {}, usage: [] };
const remote = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && !/^(1|true)$/i.test(process.env.FORCE_LOCAL_DATA || '');
export async function securityRequest(resource, { method = 'GET', body, query = '', prefer = 'return=representation' } = {}) {
  const unavailable = () => Object.assign(new Error('Practice is temporarily unavailable. Please try again shortly; your saved conversations are kept.'), { status: 503, code: 'storage_unavailable', retryable: true });
  let response;
  try { response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${resource}${query ? `?${query}` : ''}`, {
    method, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  }); } catch { console.error('storage_request_failed', JSON.stringify({ resource, method, code: 'connection_failed' })); throw unavailable(); }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    console.error('storage_request_failed', JSON.stringify({ resource, method, status: response.status, code: typeof detail?.code === 'string' ? detail.code.slice(0,30) : 'unknown' }));
    throw Object.assign(unavailable(), { storageResource: resource, storageCode: /^[A-Z0-9]{5,10}$/.test(detail?.code || '') ? detail.code : null });
  }
  try { return response.status === 204 ? null : await response.json(); }
  catch { console.error('storage_request_failed', JSON.stringify({ resource, method, code: 'invalid_response' })); throw unavailable(); }
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

// Refund unused *reserved* service budget. These counters are not actual usage.
export async function releaseLimit(key, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  if (remote()) return securityRequest('rpc/speaknow_release_limit', { method: 'POST', body: { counter_key: key, decrement_by: amount } });
  await mutateJson('security-db.json', empty, db => { if (db.counters[key]) db.counters[key].count = Math.max(0, db.counters[key].count - amount); return db; });
}
