import { apiJson } from '@/api/http';
const pending = new Map();
export function requestImpact(practiceId) {
  if (pending.has(practiceId)) return pending.get(practiceId);
  const request = apiJson('/api/presentation-impact', { practiceId }, { signal: AbortSignal.timeout(50000) }).then(value => value.session).finally(() => pending.delete(practiceId));
  pending.set(practiceId, request); return request;
}
