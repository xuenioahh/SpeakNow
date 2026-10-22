import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
export function countModelRequest() {
  const req = requestContext.getStore();
  if (req) { req.aiUsage ||= { requests: 0, inputTokens: 0, outputTokens: 0, source: 'unavailable' }; req.aiUsage.requests++; }
}
export function countModelUsage(usage = {}) {
  const req = requestContext.getStore();
  if (req) { req.aiUsage ||= { requests: 0, inputTokens: 0, outputTokens: 0 }; req.aiUsage.inputTokens += usage.input_tokens || usage.prompt_tokens || 0; req.aiUsage.outputTokens += usage.output_tokens || usage.completion_tokens || 0; req.aiUsage.source = 'ai'; }
}
