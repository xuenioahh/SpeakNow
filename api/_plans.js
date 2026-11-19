import { proTerms } from '../shared/proTerms.js';
const enabled = value => /^(true|1)$/i.test(value || '');
const limit = (name, fallback = null) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw Object.assign(new Error(`Invalid plan configuration: ${name}`), { status: 503 });
  return parsed;
};
// No production hard paywall can be activated before a real payment integration exists.
export const paywallEnabled = () => enabled(process.env.SPEAKNOW_PAYWALL_ENABLED) && (process.env.NODE_ENV !== 'production' && !process.env.VERCEL || enabled(process.env.SPEAKNOW_MEMBERSHIP_TEST_MODE) && !process.env.VERCEL);
export function planConfiguration() {
  return {
    free: { planType: 'free', monthlyPrice: 0, currency: 'CNY',
      monthlyLimits: { mock: limit('SPEAKNOW_FREE_MOCK_MONTHLY', 4), drill: limit('SPEAKNOW_FREE_DRILL_MONTHLY', 30), daily: limit('SPEAKNOW_FREE_DAILY_SECONDS', 300), ai: limit('SPEAKNOW_FREE_AI_REQUESTS', 100) },
      featureAccess: { fullQuestionBank: false, feedback: true, insights: 'basic' } },
    vip: { planType: 'vip', monthlyPrice: proTerms[0].priceCny, currency: 'CNY', terms: proTerms,
      monthlyLimits: { mock: null, drill: null, daily: limit('SPEAKNOW_VIP_DAILY_SECONDS', 10800), ai: limit('SPEAKNOW_VIP_AI_REQUESTS', 600) },
      featureAccess: { fullQuestionBank: true, feedback: true, insights: 'extended' } },
  };
}
export function billingPeriod(now = Date.now()) {
  const date = new Date(now), start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1), end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { key: new Date(start).toISOString().slice(0, 7), start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
export function effectivePlan(membership, now = Date.now()) {
  return membership?.planType === 'vip' && membership.subscriptionStatus === 'active' &&
    Number.isFinite(Date.parse(membership.currentPeriodStart)) && Date.parse(membership.currentPeriodStart) <= now &&
    Number.isFinite(Date.parse(membership.currentPeriodEnd)) && Date.parse(membership.currentPeriodEnd) > now &&
    (!membership.expiresAt || Date.parse(membership.expiresAt) > now) ? 'vip' : 'free';
}
export function localUnlimitedTesting(req, membership) {
  return Boolean(req.user && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.NODE_ENV !== 'production' &&
    enabled(process.env.FORCE_LOCAL_DATA) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) &&
    membership?.origin === 'local-testing' && membership.unlimitedTesting === true && effectivePlan(membership) === 'vip');
}
