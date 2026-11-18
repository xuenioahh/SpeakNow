// A versioned estimate, never a provider invoice. Unknown models stay unpriced.
export const usagePriceSnapshot = {
  checkedAt: '2026-11-12', currency: 'CNY',
  deepseekSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  ttsSource: 'https://elevenlabs.io/pricing/api',
  flash: { cacheHit: [.02, .04], cacheMiss: [1, 2], output: [4, 8] },
  pro: { cacheHit: [.15, .30], cacheMiss: [4.5, 9], output: [13.5, 27] },
};
export function estimateModelCost(call) {
  const model = String(call.model || '').toLowerCase();
  const flash = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4.1-flash-1017'].includes(model);
  const pro = ['deepseek-v4-pro', 'deepseek-v4-pro-0813'].includes(model);
  const rates = call.provider === 'deepseek' ? flash ? usagePriceSnapshot.flash : pro ? usagePriceSnapshot.pro : null : null;
  if (!rates || !Number.isFinite(call.inputTokens) || !Number.isFinite(call.outputTokens)) return null;
  const split = Number.isFinite(call.cacheHitTokens) && Number.isFinite(call.cacheMissTokens) && call.cacheHitTokens + call.cacheMissTokens === call.inputTokens;
  return {
    low: ((split ? call.cacheHitTokens * rates.cacheHit[0] + call.cacheMissTokens * rates.cacheMiss[0] : call.inputTokens * rates.cacheHit[0]) + call.outputTokens * rates.output[0]) / 1e6,
    high: ((split ? call.cacheHitTokens * rates.cacheHit[1] + call.cacheMissTokens * rates.cacheMiss[1] : call.inputTokens * rates.cacheMiss[1]) + call.outputTokens * rates.output[1]) / 1e6,
    cacheSplitKnown: split,
  };
}
export function tokenPackageEstimate(total, packageTokens) {
  const tokens = total.inputTokens + total.outputTokens;
  if (!Number.isSafeInteger(packageTokens) || packageTokens <= 0 || !Number.isFinite(tokens) || tokens <= 0 ||
    !total.reportedCalls || total.missingUsageCalls || total.unpricedCalls || !Number.isFinite(total.estimatedCnyLow) || !Number.isFinite(total.estimatedCnyHigh)) return null;
  return { observedTokens: tokens, packageTokens, low: total.estimatedCnyLow * packageTokens / tokens, high: total.estimatedCnyHigh * packageTokens / tokens };
}

// Costs supplied here are owner assumptions. Nothing changes public plan prices.
export function priceScenario({ variableCost, fixedMonthly, payingUsers, freeSubsidy, otherPerUser, reservePercent, paymentFeePercent, marginPercent, packageMinutes, monthlyMinutes }) {
  const values = [variableCost, fixedMonthly, freeSubsidy, otherPerUser, reservePercent, paymentFeePercent, marginPercent];
  if (values.some(value => !Number.isFinite(value) || value < 0) || !Number.isFinite(payingUsers) || payingUsers <= 0 || !Number.isFinite(packageMinutes) || packageMinutes <= 0 || !Number.isFinite(monthlyMinutes) || monthlyMinutes <= 0) return null;
  const denominator = 1 - (paymentFeePercent + marginPercent) / 100;
  if (denominator <= 0 || reservePercent > 1000) return null;
  const monthlyCost = (variableCost + otherPerUser + (fixedMonthly + freeSubsidy) / payingUsers) * (1 + reservePercent / 100);
  return { monthlyCost, monthlyPrice: monthlyCost / denominator, rechargePrice: monthlyCost * packageMinutes / monthlyMinutes / denominator };
}
