import { createHash } from 'node:crypto';
import { readLedger, readLedgerPage } from './_membershipStore.js';
import { billingPeriod } from './_plans.js';
import { estimateModelCost, usagePriceSnapshot } from '../shared/usagePricing.js';

const totals = () => ({ operations: 0, providerRequests: 0, reportedCalls: 0, missingUsageCalls: 0, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, unknownCacheInputTokens: 0, unpricedCalls: 0, estimatedCnyLow: 0, estimatedCnyHigh: 0, ttsCharacters: 0, unknownTtsRuns: 0, failedRuns: 0, runs: 0 });
const sum = (a, b) => { for (const key of Object.keys(a)) a[key] += b[key] || 0; };
export function aggregateUsage(rows, { start, end }) {
  const total = totals(), models = {}, ttsModels = {}, days = {}, modules = {}, users = [], sessions = [];
  let fixturesExcluded = 0, undatedOperations = 0, browserAsrSeconds = 0;
  for (const { owner, ledger } of rows) {
    const user = totals();
    const sessionCosts = new Map(), fixtureSessions = new Set(), actualSessions = new Set();
    for (const op of Object.values(ledger.operations || {})) {
      const runs = op.meteringRuns?.length ? op.meteringRuns : op.measurements ? [{ ...op.measurements, at: op.finishedAt }] : [];
      if (!runs.length) { if (!op.finishedAt) undatedOperations++; continue; }
      const conversation = ['conversation', 'conversation_stream'].includes(op.action);
      const module = conversation ? 'Conversation' : /speaking-feedback/.test(op.endpoint || '') ? 'Feedback' : /tts/.test(op.endpoint || '') ? 'Voice synthesis' : /voice-chat/.test(op.endpoint || '') ? 'Conversation' : 'Other / historical';
      let counted = false;
      for (const run of runs) {
        if (/fixture/.test(run.source || '')) { fixturesExcluded++; if (op.sessionId) fixtureSessions.add(op.sessionId); continue; }
        if (!Number.isFinite(run.at)) { undatedOperations++; continue; }
        if (run.at < start || run.at >= end) continue;
        const item = totals(), day = new Date(run.at).toISOString().slice(0, 10);
        item.operations = counted ? 0 : 1; counted = true; item.runs = 1;
        item.failedRuns = run.outcome === 'success' ? 0 : 1;
        let calls = run.calls || [];
        if (!calls.length && (run.providerRequests || Number.isFinite(run.inputTokens))) {
          calls = [{ provider: null, model: null, inputTokens: run.inputTokens, outputTokens: run.outputTokens }];
        }
        item.providerRequests = run.providerRequests || calls.length;
        for (const call of calls) {
          const modelKey = `${call.provider || 'Unknown provider'} / ${call.model || 'Unknown historical model'}`;
          const modelItem = totals(); modelItem.providerRequests = 1;
          const known = Number.isFinite(call.inputTokens) && Number.isFinite(call.outputTokens);
          if (known) {
            modelItem.reportedCalls = 1; modelItem.inputTokens = call.inputTokens; modelItem.outputTokens = call.outputTokens;
            const cost = estimateModelCost(call);
            if (cost) { modelItem.estimatedCnyLow = cost.low; modelItem.estimatedCnyHigh = cost.high; }
            else modelItem.unpricedCalls = 1;
            if (Number.isFinite(call.cacheHitTokens) && Number.isFinite(call.cacheMissTokens)) { modelItem.cacheHitTokens = call.cacheHitTokens; modelItem.cacheMissTokens = call.cacheMissTokens; }
            else modelItem.unknownCacheInputTokens = call.inputTokens;
          } else { modelItem.missingUsageCalls = 1; modelItem.unpricedCalls = 1; }
          models[modelKey] ||= totals(); sum(models[modelKey], modelItem);
          // Provider requests are counted separately from the usage-report count.
          sum(item, { ...modelItem, providerRequests: 0 });
        }
        if (item.providerRequests > calls.length) { item.missingUsageCalls += item.providerRequests - calls.length; item.unpricedCalls += item.providerRequests - calls.length; }
        item.ttsCharacters = run.ttsCharacters || 0;
        item.unknownTtsRuns = run.ttsCharacters && (!run.ttsProvider || !run.ttsModel) ? 1 : 0;
        if (run.ttsCharacters) {
          const voice = `${run.ttsProvider || 'Unknown provider'} / ${run.ttsModel || 'Unknown voice model'}`;
          ttsModels[voice] ||= { characters: 0, runs: 0 }; ttsModels[voice].characters += run.ttsCharacters; ttsModels[voice].runs++;
        }
        days[day] ||= totals(); modules[module] ||= totals();
        sum(total, item); sum(user, item); sum(days[day], item); sum(modules[module], item);
        if (op.sessionId) { actualSessions.add(op.sessionId); const sessionTotal = sessionCosts.get(op.sessionId) || totals(); sum(sessionTotal, item); sessionCosts.set(op.sessionId, sessionTotal); }
      }
    }
    for (const session of Object.values(ledger.sessions || {})) {
      if (session.startedAt < start || session.startedAt >= end || session.status !== 'completed' || !session.used) continue;
      if (session.source === 'fixture' || fixtureSessions.has(session.id) && !actualSessions.has(session.id)) continue;
      const cost = sessionCosts.get(session.id) || totals();
      sessions.push({ kind: session.kind, plan: session.planType || 'unknown', linked: sessionCosts.has(session.id), seconds: session.kind === 'daily' ? session.amount : null, ...cost });
    }
    for (const measurement of ledger.measurements || []) {
      const at = Date.parse(measurement.createdAt);
      if (at >= start && at < end && measurement.source === 'browser-observed' && measurement.usageType === 'browser_asr_seconds') browserAsrSeconds += measurement.seconds || 0;
    }
    if (user.runs) users.push({ account: createHash('sha256').update(owner).digest('hex').slice(0, 12), type: owner.startsWith('guest-') ? 'guest' : 'account', ...user });
  }
  const daily = sessions.filter(session => session.kind === 'daily' && session.seconds > 0);
  return { total, models, ttsModels, days, modules, users: users.sort((a, b) => b.estimatedCnyHigh - a.estimatedCnyHigh).slice(0, 100), completedSessions: sessions.length, daily: { sessions: daily.length, unlinkedSessions: daily.filter(s => !s.linked).length, seconds: daily.reduce((n, s) => n + s.seconds, 0), estimatedCnyHigh: daily.reduce((n, s) => n + s.estimatedCnyHigh, 0), ttsCharacters: daily.reduce((n, s) => n + s.ttsCharacters, 0), missingUsageCalls: daily.reduce((n, s) => n + s.missingUsageCalls, 0), unpricedCalls: daily.reduce((n, s) => n + s.unpricedCalls, 0) }, fixturesExcluded, undatedOperations, browserAsrSeconds };
}
export async function adminUsageReport(req) {
  if (!req.user) throw Object.assign(new Error('Sign in to view usage.'), { status: 401 });
  if (req.user.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { status: 403 });
  const days = req.body.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw Object.assign(new Error('Choose 1–90 days.'), { status: 400 });
  const end = Date.now() + 1, start = end - days * 86400000;
  const rows = []; let truncated = false;
  for (let offset = 0; offset <= 1000; offset += 100) {
    const page = await readLedgerPage(offset, 100);
    if (offset === 1000) { truncated = page.length > 0; break; }
    rows.push(...page); if (page.length < 100) break;
  }
  return { ...aggregateUsage(rows, { start, end }), start: new Date(start).toISOString(), end: new Date(end).toISOString(), scannedLedgers: rows.length, truncated, prices: usagePriceSnapshot, basis: 'Provider-reported tokens; accepted TTS characters; estimated costs. Historical gaps and unknown models remain unpriced. Does not include infrastructure, tax, payment fees or other providers without usage receipts.' };
}
export async function accountUsageReport(req) {
  if (!req.user) throw Object.assign(new Error('Sign in to view your usage.'), { status: 401 });
  const period = billingPeriod(), end = Date.now() + 1;
  const result = aggregateUsage([{ owner: req.user.id, ledger: await readLedger(req.user.id) }], { start: Date.parse(period.start), end });
  const { users, ...report } = result;
  return { ...report, start: period.start, end: new Date(end).toISOString(), prices: usagePriceSnapshot, billingConfirmed: false,
    basis: 'Your provider-reported tokens only. Estimates are not invoices, a prepaid balance or a retail VIP price. Voice, infrastructure, tax and missing receipts are excluded.' };
}
