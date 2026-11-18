import { getSpeakingTask } from '../shared/speakingTasks.js';
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
export function countModelRequest() {
  const req = requestContext.getStore();
  if (req) { req.aiUsage ||= { requests: 0, inputTokens: 0, outputTokens: 0, source: 'unavailable' }; req.aiUsage.requests++; }
}
export function countModelUsage(usage = {}) {
  const req = requestContext.getStore();
  if (req && usage && [usage.input_tokens, usage.prompt_tokens, usage.output_tokens, usage.completion_tokens].some(Number.isFinite)) { req.aiUsage ||= { requests: 0, inputTokens: 0, outputTokens: 0 }; req.aiUsage.usageReported = true; req.aiUsage.usageReports = (req.aiUsage.usageReports || 0) + 1; req.aiUsage.inputTokens += usage.input_tokens || usage.prompt_tokens || 0; req.aiUsage.outputTokens += usage.output_tokens || usage.completion_tokens || 0; req.aiUsage.source = 'ai'; }
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
  if (!usage.usageReported || usage.usageReports !== usage.requests) return null;
  return Math.ceil(usage.inputTokens + usage.outputTokens);
}
