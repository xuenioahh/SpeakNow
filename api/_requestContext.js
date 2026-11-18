import { getSpeakingTask } from '../shared/speakingTasks.js';
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
function contextUsage(req) {
  req.aiUsage ||= {};
  return Object.assign(req.aiUsage, { calls: req.aiUsage.calls || [] });
}
const token = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function countModelRequest({ provider = null, model = null } = {}) {
  const req = requestContext.getStore();
  if (!req) return null;
  const usage = contextUsage(req), id = usage.calls.length;
  usage.calls.push({ id, provider, model, startedAt: Date.now(), requested: true, inputTokens: null, outputTokens: null, cacheHitTokens: null, cacheMissTokens: null });
  usage.requests = usage.calls.filter(call => call.requested).length;
  return id;
}
// Providers can repeat cumulative usage in several SSE chunks. Update the same
// call rather than adding the totals again. No prompt text enters this record.
export function countModelUsage(report = {}, { callId = null, provider = null, model = null } = {}) {
  const req = requestContext.getStore();
  if (!req || !report) return;
  const usage = contextUsage(req);
  let call = usage.calls.find(item => item.id === callId) || usage.calls.at(-1);
  if (!call) { call = { id: 0, requested: false, startedAt: Date.now() }; usage.calls.push(call); }
  call.provider = provider || call.provider || null; call.model = model || call.model || null;
  call.inputTokens = token(report.input_tokens ?? report.prompt_tokens);
  call.outputTokens = token(report.output_tokens ?? report.completion_tokens);
  let hit = token(report.prompt_cache_hit_tokens ?? report.prompt_tokens_details?.cached_tokens);
  let miss = token(report.prompt_cache_miss_tokens);
  if (hit !== null && miss === null && call.inputTokens !== null) miss = call.inputTokens - hit;
  if (hit !== null && miss !== null && hit + miss === call.inputTokens && miss >= 0) { call.cacheHitTokens = hit; call.cacheMissTokens = miss; }
  else { call.cacheHitTokens = null; call.cacheMissTokens = null; }
  call.reported = call.inputTokens !== null && call.outputTokens !== null;
  usage.usageReported = usage.calls.some(item => item.reported);
  usage.usageReports = usage.calls.filter(item => item.reported).length;
  usage.inputTokens = usage.calls.reduce((sum, item) => sum + (item.inputTokens || 0), 0);
  usage.outputTokens = usage.calls.reduce((sum, item) => sum + (item.outputTokens || 0), 0);
  if (usage.usageReported) usage.source = 'ai';
}
// Conservative reservation only, never presented as measured provider usage.
export function estimateAiReservation(req) {
  const task = getSpeakingTask(req.body?.attempt?.taskId || req.body?.taskId);
  const characters = JSON.stringify(req.body || {}).length + (task ? JSON.stringify(task).length : 0);
  return Math.min(100000, Math.max(8000, Math.ceil(characters * 2 + 8000)));
}
export function measuredAiTokens(req) {
  const usage = req.aiUsage;
  if (!usage?.requests) return 0;
  if (!usage.usageReported || usage.calls?.some(call => call.requested && !call.reported) || usage.usageReports !== usage.requests) return null;
  return Math.ceil(usage.inputTokens + usage.outputTokens);
}
