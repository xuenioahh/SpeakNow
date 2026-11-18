import { createHash } from 'node:crypto';
import { readMembership, readLedger, mutateLedger } from './_membershipStore.js';
import { planConfiguration, paywallEnabled, billingPeriod, effectivePlan } from './_plans.js';
import { assertTaskAccess } from './_bankAccess.js';
import { getOwned } from './_appStore.js';
import { getSpeakingTask, validateAttempt } from '../shared/speakingTasks.js';
import { requestContext } from './_requestContext.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const problem = (message, status = 429, code = 'quota_exhausted', extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
export function membershipSubject(req) {
  if (req.user) return req.user.id;
  const address = process.env.VERCEL ? req.headers?.['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  return `guest-${hash(String(address || 'unknown')).slice(0, 32)}`;
}
function sweep(ledger, now) {
  for (const session of Object.values(ledger.sessions)) if (session.status === 'reserved' && session.expiresAt <= now) {
    if (session.kind === 'daily' && session.used) session.amount = Math.min(session.amount, Math.ceil((now - session.startedAt) / 1000));
    session.status = session.used ? 'completed' : 'cancelled';
  }
}
const amounts = (ledger, period, kind) => Object.values(ledger.sessions).filter(session => session.period === period && session.kind === kind && session.status !== 'cancelled').reduce((sum, session) => sum + session.amount, 0);
const aiAmount = (ledger, period) => Object.values(ledger.operations).filter(op => op.period === period).reduce((sum, op) => sum + (op.charges || 0), 0);
function quotaError(kind, period) { return problem(`${kind === 'daily' ? 'Daily Conversation time' : kind === 'ielts' ? 'Full IELTS mock' : kind === 'toefl' ? 'TOEFL practice' : 'AI practice'} allowance used. Resets ${period.end.slice(0, 10)}. Membership information is available.`, 429, 'quota_exhausted', { resetsAt: period.end, usageType: kind, membershipPath: '/membership' }); }
function assertLimit(kind, used, amount, plan, period) {
  if (!paywallEnabled()) return;
  const limit = plan.monthlyLimits[kind];
  if (limit === null || limit === undefined) throw problem('VIP usage limits are not configured. Contact the site owner; payment is not available.', 503, 'plan_not_configured');
  if (used + amount > limit) throw quotaError(kind, period);
}
export async function reservePractice(req, { id, taskId, kind = 'daily' }, now = Date.now()) {
  if (kind === 'daily' && taskId || kind !== 'daily' && !taskId) throw problem('Daily practice has no exam task; exam practice needs an authorized task.', 400, 'invalid_session');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id || '')) throw problem('Invalid practice session.', 400, 'invalid_session');
  const owner = membershipSubject(req), membership = await readMembership(owner), plan = planConfiguration()[effectivePlan(membership, now)], period = billingPeriod(now);
  const previous = (await readLedger(owner)).sessions[id];
  const enrolled = Boolean(previous) && previous.taskId === taskId && ['reserved', 'completed'].includes(previous.status) && previous.expiresAt > now;
  let task = null;
  if (taskId && kind !== 'daily') { task = enrolled ? getSpeakingTask(taskId) : assertTaskAccess(req, taskId, membership); kind = task.exam === 'toefl' ? 'toefl' : task.type === 'ielts-mock' ? 'ielts' : 'ieltsQuick'; }
  if (!['daily', 'toefl', 'ielts', 'ieltsQuick'].includes(kind)) throw problem('Unknown usage type.', 400, 'invalid_usage');
  return mutateLedger(owner, ledger => {
    sweep(ledger, now);
    const existing = ledger.sessions[id];
    if (existing) {
      if (existing.taskId !== (taskId || null) || existing.kind !== kind) throw problem('Session belongs to a different practice.', 409, 'session_mismatch');
      if (existing.status !== 'cancelled') return existing;
    }
    let amount = kind === 'daily' ? 300 : 1;
    const used = amounts(ledger, period.key, kind);
    if (kind === 'daily' && paywallEnabled()) amount = Math.max(1, Math.min(300, (plan.monthlyLimits.daily ?? 0) - used));
    assertLimit(kind, used, amount, plan, period);
    const session = { id, taskId: taskId || null, kind, amount, period: period.key, status: 'reserved', used: false, startedAt: now, expiresAt: now + 2 * 60 * 60 * 1000, planType: plan.planType, planLimits: plan.monthlyLimits, shadow: !paywallEnabled() };
    ledger.sessions[id] = session;
    return session;
  });
}
export async function finishPractice(req, id, cancel = false, now = Date.now()) {
  return mutateLedger(membershipSubject(req), ledger => {
    const session = ledger.sessions[id];
    if (!session) throw problem('Practice session not found.', 404, 'session_not_found');
    if (session.status !== 'reserved') return session;
    session.amount = session.kind === 'daily' ? session.used ? Math.min(session.amount, Math.max(1, Math.ceil((now - session.startedAt) / 1000))) : 0 : session.amount;
    session.status = cancel && !session.used || !session.used ? 'cancelled' : 'completed';
    session.finishedAt = now;
    return session;
  });
}
export async function membershipSnapshot(req, now = Date.now()) {
  const owner = membershipSubject(req), membership = await readMembership(owner), planType = effectivePlan(membership, now), plans = planConfiguration(), period = billingPeriod(now);
  return mutateLedger(owner, ledger => {
    sweep(ledger, now);
    const usage = Object.fromEntries(['toefl', 'ielts', 'ieltsQuick', 'daily'].map(kind => [kind, amounts(ledger, period.key, kind)]));
    usage.ai = aiAmount(ledger, period.key);
    const limits = plans[planType].monthlyLimits;
    const remainingQuota = Object.fromEntries(Object.entries(limits).map(([kind, limit]) => [kind, limit === null ? null : Math.max(0, limit - (usage[kind] || 0))]));
    return { membership: membership || { userId: req.user?.id || null, planType: 'free', subscriptionStatus: 'inactive', currentPeriodStart: period.start, currentPeriodEnd: period.end, expiresAt: null },
      effectivePlan: planType, plans, usage, remainingQuota, billingPeriod: period, paywallEnabled: paywallEnabled(), paymentsEnabled: false,
      accountingMode: process.env.SPEAKNOW_ENGINEERING_FIXTURE === 'true' ? 'fixture' : 'provider-reported',
      detailedInsights: planType === 'vip' || !paywallEnabled(),
      trialAvailable: Boolean(req.user) && planType !== 'vip' && !ledger.trialUsedAt && process.env.SPEAKNOW_VIP_TRIAL_ENABLED !== 'false',
      trialUsedAt: ledger.trialUsedAt || null, lastEntitlement: ledger.entitlement || null,
      upgradeRequest: ledger.upgradeRequest || null, membershipHistory: (ledger.membershipHistory || []).slice(-30).reverse() };
  });
}
async function sessionForRequest(req) {
  const body = req.body || {};
  let attempt = body.attempt;
  if (attempt && req.user) {
    const saved = await getOwned('voiceSessions', req.user.id, attempt.id);
    if (saved?.report?.learning) {
      // Feedback on an owned saved attempt remains available after membership expiry.
      const old = (await readLedger(membershipSubject(req))).sessions[attempt.id];
      return old || { id: attempt.id, kind: saved.report.learning.exam, status: 'completed', expiresAt: 0 };
    }
  }
  if (attempt) {
    attempt = validateAttempt(attempt);
    return reservePractice(req, { id: attempt.id, taskId: attempt.track === 'exam' ? attempt.taskId : null, kind: attempt.track === 'exam' ? 'exam' : 'daily' });
  }
  if (body.taskId && body.sessionId) return reservePractice(req, { id: body.sessionId, taskId: body.taskId, kind: 'exam' });
  if (body.sessionId && !body.text) return reservePractice(req, { id: body.sessionId, kind: 'daily' });
  return null;
}
// One reservation per user/session; one operation per logical AI request. Duplicate
// requests cannot invoke a provider twice, even across processes or serverless instances.
export async function executeMetered(req, res, handler) {
  const owner = membershipSubject(req), membership = await readMembership(owner), plan = planConfiguration()[effectivePlan(membership)], period = billingPeriod();
  const session = await sessionForRequest(req), endpoint = String(req.url || '').split('?')[0];
  const fingerprint = hash(JSON.stringify({ endpoint, body: req.body }));
  const logical = req.headers?.['x-idempotency-key'] || req.body?.requestId || (req.body?.attempt ? `feedback:${req.body.attempt.id}` : req.body?.sessionId ? `${req.body.sessionId}:${req.body.turnId || req.body.questionIndex || 0}:${req.body.action || endpoint}` : fingerprint);
  if (String(logical).length > 200) throw problem('Invalid request ID.', 400, 'invalid_request_id');
  const key = hash(`${endpoint}:${logical}`), now = Date.now();
  const claim = await mutateLedger(owner, ledger => {
    sweep(ledger, now);
    const old = ledger.operations[key];
    if (old && old.fingerprint !== fingerprint) throw problem('Request ID was reused with different content.', 409, 'idempotency_conflict');
    if (old?.status === 'completed') return { cached: true, value: old.response };
    if (old?.status === 'running' && old.leaseUntil > now) throw problem('This request is already processing. Your practice is kept.', 409, 'request_in_progress');
    // A started session keeps its allowance when the month or membership changes.
    const conversation = ['conversation', 'conversation_stream'].includes(req.body?.action) || endpoint === '/api/voice-chat' && !req.body?.action;
    if (conversation && session?.status === 'completed') throw problem('This conversation has finished. Start a new practice.', 409, 'session_closed');
    if (conversation && session?.kind === 'daily' && session.used && paywallEnabled() && now > session.startedAt + session.amount * 1000) throw quotaError('daily', period);
    assertLimit('ai', aiAmount(ledger, period.key), 1, session?.status === 'reserved' && session.expiresAt > now && session.planLimits ? { ...plan, monthlyLimits: session.planLimits } : plan, period);
    ledger.operations[key] = { fingerprint, period: period.key, status: 'running', charges: (old?.charges || 0) + 1, leaseUntil: now + 60000, attempts: (old?.attempts || 0) + 1, response: null };
    return { cached: false };
  });
  if (claim.cached) {
    if (!claim.value) throw problem('This audio request has already completed. Replay the saved audio.', 409, 'already_completed');
    for (const [name, value] of Object.entries(claim.value.headers || {})) res.setHeader(name, value);
    if (claim.value.json !== undefined) return res.status(claim.value.status).json(claim.value.json);
    for (const chunk of claim.value.chunks || []) res.write(chunk);
    return res.end();
  }
  let status = 200, json, chunks = [], textBytes = 0;
  const headers = {};
  const proxy = {
    get headersSent() { return res.headersSent; }, get statusCode() { return status; }, set statusCode(value) { status = value; res.statusCode = value; },
    status(code) { status = code; res.status(code); return proxy; },
    setHeader(name, value) { headers[name] = value; res.setHeader(name, value); },
    json(value) { json = value; return res.json(value); },
    write(chunk) { if (typeof chunk === 'string' && textBytes < 64000) { chunks.push(chunk); textBytes += chunk.length; } return res.write(chunk); },
    end(value) { return res.end(value); }, flushHeaders() { res.flushHeaders?.(); },
    on(...args) { return res.on?.(...args); }, off(...args) { return res.off?.(...args); }
  };
  let failed = false;
  try { await requestContext.run(req, () => handler(req, proxy)); }
  catch (error) { failed = true; status = error.status || 503; throw error; }
  finally {
    const usage = req.aiUsage || {}, success = !failed && status < 400 && (!headers['Content-Type']?.includes('event-stream') || chunks.some(chunk => /event: done/.test(chunk)));
    await mutateLedger(owner, ledger => {
      const op = ledger.operations[key];
      op.status = success ? 'completed' : 'failed'; op.finishedAt = Date.now();
      // Product allowance is charged for a delivered result. Failed provider
      // calls still retain their actual usage/cost telemetry below.
      if (!success) op.charges = Math.max(0, op.charges - 1);
      op.measurements = { providerRequests: usage.requests || 0, inputTokens: usage.usageReported ? usage.inputTokens : null, outputTokens: usage.usageReported ? usage.outputTokens : null,
        ttsCharacters: usage.ttsCharacters ?? null, ttsMeasurementBasis: usage.ttsCharacters ? 'provider-accepted-input-characters' : null, asrSeconds: null, source: process.env.SPEAKNOW_ENGINEERING_FIXTURE === 'true' ? 'fixture' : usage.usageReported ? 'provider-reported' : usage.ttsCharacters ? 'provider-accepted-input' : 'unreported', outcome: success ? 'success' : 'failed-or-cancelled' };
      op.response = success && (json !== undefined || chunks.length) ? { status, headers: Object.fromEntries(Object.entries(headers).filter(([name]) => ['content-type', 'cache-control'].includes(name.toLowerCase()))), ...(json !== undefined ? { json } : { chunks }) } : null;
      if (success && session && ledger.sessions[session.id]) { ledger.sessions[session.id].used = true; }
    }).catch(error => console.error('Membership accounting persistence failed:', error.message));
  }
}
export async function usageAudit(owner) { return readLedger(owner); }

// Browser-native ASR offers no provider billing receipt. Keep observed duration
// separate from provider-reported costs; never use this telemetry to grant quota.
export async function recordBrowserUsage(req, { sessionId, id, usageType, seconds }) {
  if (usageType !== 'browser_asr_seconds' || !/^[a-zA-Z0-9-]{8,100}$/.test(id || '') || !Number.isFinite(seconds) || seconds <= 0 || seconds > 600) throw problem('Invalid speech usage measurement.', 400, 'invalid_measurement');
  return mutateLedger(membershipSubject(req), ledger => {
    if (!ledger.sessions[sessionId]) throw problem('Practice session not found.', 404, 'session_not_found');
    const old = ledger.measurements.find(item => item.id === id);
    if (old) { if (old.sessionId !== sessionId || old.seconds !== seconds) throw problem('Measurement ID conflict.', 409, 'measurement_conflict'); return old; }
    const value = { id, sessionId, usageType, seconds, source: process.env.SPEAKNOW_ENGINEERING_FIXTURE === 'true' ? 'fixture-browser-observed' : 'browser-observed', billingConfirmed: false, createdAt: new Date().toISOString() };
    ledger.measurements.push(value); return value;
  });
}
