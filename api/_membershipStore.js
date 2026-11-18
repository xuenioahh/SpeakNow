// Extends the existing security store and its atomic JSON / Supabase persistence.
import { readJson, mutateJson } from './_jsonStore.js';
import { securityRequest } from './_securityStore.js';
const empty = { sessions: {}, counters: {}, usage: [] };
const remote = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && !/^(1|true)$/i.test(process.env.FORCE_LOCAL_DATA || '');
export const emptyLedger = () => ({ sessions: {}, operations: {}, measurements: [] });
export async function readMembership(owner) {
  const entitlement = (await readLedger(owner)).entitlement;
  if (entitlement && Date.parse(entitlement.currentPeriodEnd) > Date.now()) return { ...entitlement, userId: owner };
  if (remote()) {
    const row = (await securityRequest('app_memberships', { query: `user_id=eq.${encodeURIComponent(owner)}&select=*` }))[0];
    return row ? { userId: row.user_id, planType: row.plan_type, subscriptionStatus: row.subscription_status, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end, expiresAt: row.expires_at } : null;
  }
  return (await readJson('security-db.json', empty)).memberships?.[owner] || null;
}
// Server-only provisioning. There is deliberately no public membership write action.
export async function provisionMembership(owner, membership) {
  if (remote()) return securityRequest('app_memberships', { method: 'POST', body: { user_id: owner, plan_type: membership.planType, subscription_status: membership.subscriptionStatus, current_period_start: membership.currentPeriodStart, current_period_end: membership.currentPeriodEnd, expires_at: membership.expiresAt } });
  await mutateJson('security-db.json', empty, db => { db.memberships ||= {}; db.memberships[owner] = { ...membership, userId: owner }; return db; });
}
export async function readLedger(owner) {
  if (remote()) return (await securityRequest('app_usage_ledgers', { query: `user_id=eq.${encodeURIComponent(owner)}&select=state` }))[0]?.state || emptyLedger();
  return (await readJson('security-db.json', empty)).membershipLedgers?.[owner] || emptyLedger();
}
// Server-only scan for an administrator's aggregate report. Responses and
// transcripts never leave this module's caller in the report payload.
export async function readLedgerPage(offset, limit) {
  if (remote()) return (await securityRequest('app_usage_ledgers', { query: `select=user_id,state&order=user_id.asc&offset=${offset}&limit=${limit}` })).map(row => ({ owner: row.user_id, ledger: row.state }));
  return Object.entries((await readJson('security-db.json', empty)).membershipLedgers || {}).sort(([a], [b]) => a.localeCompare(b)).slice(offset, offset + limit).map(([owner, ledger]) => ({ owner, ledger }));
}
export async function mutateLedger(owner, operation) {
  if (!remote()) {
    let result;
    await mutateJson('security-db.json', empty, async db => {
      db.membershipLedgers ||= {};
      const ledger = db.membershipLedgers[owner] ||= emptyLedger();
      result = await operation(ledger);
      return db;
    });
    return result;
  }
  for (let retry = 0; retry < 16; retry++) {
    const row = (await securityRequest('app_usage_ledgers', { query: `user_id=eq.${encodeURIComponent(owner)}&select=state,revision` }))[0];
    const state = row?.state || emptyLedger(), result = await operation(state);
    const committed = await securityRequest('rpc/speaknow_commit_usage', { method: 'POST', body: { owner_id: owner, expected_revision: row?.revision || 0, next_state: state } });
    if (committed) return result;
  }
  throw Object.assign(new Error('Usage is busy. Retry this request.'), { status: 503 });
}
