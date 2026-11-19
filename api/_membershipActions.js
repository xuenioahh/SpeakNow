import { proTerms } from '../shared/proTerms.js';
import { randomUUID } from 'node:crypto';
import { readMembership, mutateLedger, readLedger } from './_membershipStore.js';
import { effectivePlan } from './_plans.js';
import { getUserById } from './_appStore.js';
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
function signedIn(req) { if (!req.user) throw problem('Sign in to manage your membership.', 401); }
function history(ledger, type, actor, details = {}) {
  ledger.membershipHistory ||= [];
  ledger.membershipHistory.push({ id: randomUUID(), type, actor, at: new Date().toISOString(), ...details });
  ledger.membershipHistory = ledger.membershipHistory.slice(-100);
}
function entitlement(days, origin, extendFrom = Date.now()) {
  const start = Date.now(), end = Math.max(start, extendFrom) + days * 86400000;
  return { planType: 'vip', subscriptionStatus: 'active', currentPeriodStart: new Date(start).toISOString(), currentPeriodEnd: new Date(end).toISOString(), expiresAt: new Date(end).toISOString(), origin };
}
export async function startVipTrial(req) {
  signedIn(req);
  if (process.env.SPEAKNOW_VIP_TRIAL_ENABLED === 'false') throw problem('VIP trials are currently unavailable.', 403);
  if (effectivePlan(await readMembership(req.user.id)) === 'vip') throw problem('VIP is already active.', 409);
  return mutateLedger(req.user.id, ledger => {
    if (effectivePlan(ledger.entitlement) === 'vip') throw problem('VIP is already active.', 409);
    if (ledger.trialUsedAt) throw problem('This account has already used its VIP trial.', 409);
    ledger.trialUsedAt = new Date().toISOString();
    ledger.entitlement = entitlement(7, 'trial');
    history(ledger, 'trial-started', req.user.id, { expiresAt: ledger.entitlement.expiresAt });
    return { ok: true, expiresAt: ledger.entitlement.expiresAt };
  });
}
export async function requestVip(req) {
  signedIn(req);
  const requestType = req.body.requestType || 'vip-access';
  if (!['vip-access', 'renewal', 'more-practice'].includes(requestType)) throw problem('Choose a supported VIP request.');
  const term = requestType === 'more-practice' ? null : proTerms.find(item => item.days === req.body.termDays);
  if (req.body.termDays !== undefined && !term && requestType !== 'more-practice') throw problem('Choose a listed Pro term.');
  const note = req.body.note;
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) throw problem('Keep your request under 500 characters.');
  return mutateLedger(req.user.id, ledger => {
    if (ledger.upgradeRequest?.status === 'pending') return ledger.upgradeRequest;
    ledger.upgradeRequest = { id: randomUUID(), status: 'pending', requestType, ...(term ? { termDays: term.days, priceCny: term.priceCny } : {}), paymentStatus: 'not-requested', note: String(note || '').trim(), createdAt: new Date().toISOString() };
    history(ledger, 'vip-requested', req.user.id);
    return ledger.upgradeRequest;
  });
}
export async function adminMembership(req) {
  signedIn(req);
  if (req.user.role !== 'admin') throw problem('Administrator access required.', 403);
  const { userId, action, days } = req.body;
  if (typeof userId !== 'string' || !await getUserById(userId)) throw problem('Account not found.', 404);
  if (action === 'admin-status') { const ledger = await readLedger(userId); return { membership: await readMembership(userId), upgradeRequest: ledger.upgradeRequest || null, history: (ledger.membershipHistory || []).slice(-30).reverse() }; }
  if (action === 'admin-grant' && (!Number.isInteger(days) || days < 1 || days > 366)) throw problem('Choose between 1 and 366 days.');
  const storedMembership = action === 'admin-grant' ? await readMembership(userId) : null;
  return mutateLedger(userId, ledger => {
    if (req.body.requestId && (ledger.upgradeRequest?.id !== req.body.requestId || ledger.upgradeRequest.status !== 'pending')) throw problem('This request has already changed. Refresh its status.', 409);
    if (action === 'admin-grant') {
      if (ledger.upgradeRequest?.status === 'pending' && ledger.upgradeRequest.termDays && days !== ledger.upgradeRequest.termDays) throw problem('Grant the term selected in the pending request.', 409);
      const currentMembership = ledger.entitlement || storedMembership;
      const extendFrom = effectivePlan(currentMembership) === 'vip' ? Date.parse(currentMembership.expiresAt || currentMembership.currentPeriodEnd) : Date.now();
      ledger.entitlement = entitlement(days, 'administrator', extendFrom);
      if (ledger.upgradeRequest?.status === 'pending') ledger.upgradeRequest = { ...ledger.upgradeRequest, status: 'approved', decidedAt: new Date().toISOString() };
      history(ledger, 'vip-granted', req.user.id, { days, expiresAt: ledger.entitlement.expiresAt });
    } else if (action === 'admin-revoke') {
      ledger.trialUsedAt ||= new Date().toISOString();
      ledger.entitlement = { planType: 'free', subscriptionStatus: 'cancelled', currentPeriodStart: new Date().toISOString(), currentPeriodEnd: '2099-01-01T00:00:00.000Z', expiresAt: null, origin: 'administrator' };
      history(ledger, 'vip-revoked', req.user.id);
    } else if (action === 'admin-decline') {
      if (!ledger.upgradeRequest) throw problem('No upgrade request exists.', 404);
      ledger.upgradeRequest = { ...ledger.upgradeRequest, status: 'declined', decidedAt: new Date().toISOString() };
      history(ledger, 'vip-request-declined', req.user.id);
    } else throw problem('Unknown membership action.');
    return { ok: true };
  });
}
