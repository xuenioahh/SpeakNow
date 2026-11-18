import { authenticate, checkOrigin } from './_auth.js';
import { consumeLimit, releaseLimit, recordUsage } from './_securityStore.js';
import { createHash, randomUUID } from 'node:crypto';
import { estimateAiReservation, measuredAiTokens, requestContext } from './_requestContext.js';
import { executeMetered } from './_membership.js';
import { readMembership } from './_membershipStore.js';
import { localUnlimitedTesting } from './_plans.js';

export function protectedApi(handler, { admin = false, ai = false } = {}) {
  return async (req, res) => {
    const started = Date.now();
    try {
      const user = await authenticate(req, { admin });
      if (!await consumeLimit(`${ai ? 'ai-minute' : 'requests'}:${user.id}`, ai ? Number(process.env.SPEAKNOW_AI_MINUTE_REQUESTS || 24) : 180, 60000)) {
        res.setHeader('Retry-After', '60');
        throw Object.assign(new Error('You are sending requests too quickly. Your work is saved; retry in about a minute.'), { status: 429, code: 'request_rate_limited', retryAfterSeconds: 60 });
      }
      const run = async (request, response) => {
        const reserved = ai ? estimateAiReservation(request) : 0;
        let globalReserved = false, userReserved = false;
        try {
        if (ai) {
          const unlimitedTesting = localUnlimitedTesting(req, await readMembership(user.id));
          if (!unlimitedTesting && !await consumeLimit(`ai-day:${user.id}`, Number(process.env.SPEAKNOW_AI_DAILY_REQUESTS || 100), 86400000)) throw Object.assign(new Error('Daily analysis request limit reached.'), { status: 429 });
          if (!await consumeLimit('ai-global-day', Number(process.env.SPEAKNOW_AI_GLOBAL_REQUESTS || 2000), 86400000)) throw Object.assign(new Error('Service analysis budget reached.'), { status: 429 });
          if (!await consumeLimit('ai-global-tokens', Number(process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET || 2000000), 86400000, reserved)) throw Object.assign(new Error('Service token budget reached.'), { status: 429 });
          globalReserved = true;
          if (JSON.stringify(request.body || {}).length > 50000) throw Object.assign(new Error('Analysis input is too large.'), { status: 413 });
          if (!unlimitedTesting && !await consumeLimit(`tokens:${user.id}`, Number(process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET || 600000), 86400000, reserved)) throw Object.assign(new Error('Daily token budget reached.'), { status: 429 });
          userReserved = !unlimitedTesting;
        }
        await requestContext.run(request, () => handler(request, response)); }
        finally {
          const measured = measuredAiTokens(request);
          if (ai && measured !== null && measured < reserved) await Promise.all([globalReserved ? releaseLimit('ai-global-tokens', reserved - measured) : null, userReserved ? releaseLimit(`tokens:${user.id}`, reserved - measured) : null]).catch(error => console.error('Reserved budget refund failed:', error.message));
          if (ai) await recordUsage({ id: randomUUID(), user_id: user.id, endpoint: request.url?.split('?')[0] || '', requests: request.aiUsage?.requests || 0, input_tokens: request.aiUsage?.inputTokens || 0, output_tokens: request.aiUsage?.outputTokens || 0, latency_ms: Date.now() - started, source: process.env.SPEAKNOW_ENGINEERING_FIXTURE === 'true' ? 'fixture' : request.aiUsage?.source || 'unreported', created_date: new Date().toISOString() }).catch(error => console.error('Usage persistence failed:', error.message));
        }
      };
      res.setHeader('Cache-Control', 'no-store');
      if (ai) await executeMetered(req, res, run); else await run(req, res);
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Request could not be completed.', code: error.code || 'request_failed', resetsAt: error.resetsAt, membershipPath: error.membershipPath, retryAfterSeconds: error.retryAfterSeconds });
    }
  };
}
export async function limitLogin(req) {
  checkOrigin(req);
  const address = req.socket?.remoteAddress || req.headers?.['x-vercel-forwarded-for'] || 'unknown';
  const key = createHash('sha256').update(String(address)).digest('hex');
  if (!await consumeLimit(`login:${key}`, 20, 15 * 60000)) throw Object.assign(new Error('Too many sign-in attempts. Retry later.'), { status: 429 });
}
