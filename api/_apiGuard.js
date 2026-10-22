import { authenticate, checkOrigin } from './_auth.js';
import { consumeLimit, recordUsage } from './_securityStore.js';
import { createHash, randomUUID } from 'node:crypto';
import { requestContext } from './_requestContext.js';

export function protectedApi(handler, { admin = false, ai = false } = {}) {
  return async (req, res) => {
    const started = Date.now();
    try {
      const user = await authenticate(req, { admin });
      if (!await consumeLimit(`${ai ? 'ai-minute' : 'requests'}:${user.id}`, ai ? 12 : 180, 60000)) throw Object.assign(new Error('Rate limit exceeded; retry later.'), { status: 429 });
      if (ai) {
        if (!await consumeLimit(`ai-day:${user.id}`, Number(process.env.SPEAKNOW_AI_DAILY_REQUESTS || 100), 86400000)) throw Object.assign(new Error('Daily analysis request limit reached.'), { status: 429 });
        if (!await consumeLimit('ai-global-day', Number(process.env.SPEAKNOW_AI_GLOBAL_REQUESTS || 2000), 86400000)) throw Object.assign(new Error('Service analysis budget reached.'), { status: 429 });
        if (!await consumeLimit('ai-global-tokens', Number(process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET || 2000000), 86400000, 100000)) throw Object.assign(new Error('Service token budget reached.'), { status: 429 });
        // A conservative reservation bounds provider retries and output, even on failures.
        if (JSON.stringify(req.body || {}).length > 50000) throw Object.assign(new Error('Analysis input is too large.'), { status: 413 });
        if (!await consumeLimit(`tokens:${user.id}`, Number(process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET || 600000), 86400000, 100000)) throw Object.assign(new Error('Daily token budget reached.'), { status: 429 });
      }
      res.setHeader('Cache-Control', 'no-store');
      await requestContext.run(req, () => handler(req, res));
      if (ai) await recordUsage({ id: randomUUID(), user_id: user.id, endpoint: req.url?.split('?')[0] || '', requests: req.aiUsage?.requests || 0, input_tokens: req.aiUsage?.inputTokens || 0, output_tokens: req.aiUsage?.outputTokens || 0, latency_ms: Date.now() - started, source: req.aiUsage?.source || 'unavailable', created_date: new Date().toISOString() }).catch(error => console.error('Usage persistence failed:', error.message));
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Request could not be completed.', code: error.code || 'request_failed' });
    }
  };
}
export async function limitLogin(req) {
  checkOrigin(req);
  // Platform-derived IP only; arbitrary x-user-id and body user IDs are never identities.
  const address = req.socket?.remoteAddress || req.headers?.['x-vercel-forwarded-for'] || 'unknown';
  const key = createHash('sha256').update(String(address)).digest('hex');
  if (!await consumeLimit(`login:${key}`, 20, 15 * 60000)) throw Object.assign(new Error('Too many sign-in attempts. Retry later.'), { status: 429 });
}
