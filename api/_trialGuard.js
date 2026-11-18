import { createHash } from 'node:crypto';
import { checkOrigin, cookies } from './_auth.js';
import { protectedApi } from './_apiGuard.js';
import { consumeLimit, releaseLimit } from './_securityStore.js';
import { estimateAiReservation, measuredAiTokens } from './_requestContext.js';
import { executeMetered } from './_membership.js';
// Anonymous access is limited to inference, never to account data or cloud files.
export function trialApi(handler) {
  const signedIn = protectedApi(handler, {
    ai: true
  });
  return async (req, res) => {
    if (cookies(req).speaknow_session) return signedIn(req, res);
    try {
      checkOrigin(req);
      if (req.method !== 'POST' || !String(req.headers?.['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Use a JSON POST request'), {
        status: 405
      });
      if (JSON.stringify(req.body || {}).length > 45000) throw Object.assign(new Error('Practice input too large'), {
        status: 413
      });
      const address = process.env.VERCEL ? req.headers?.['x-vercel-forwarded-for'] || 'unknown' : req.socket?.remoteAddress || 'unknown';
      const id = createHash('sha256').update(String(address)).digest('hex');
      res.setHeader('Cache-Control', 'no-store');
      await executeMetered(req, res, async (request, response) => {
        const reserved = estimateAiReservation(request);
        if (!(await consumeLimit(`trial-minute:${id}`, Number(process.env.SPEAKNOW_TRIAL_MINUTE_REQUESTS || 20), 60000))) {
          response.setHeader('Retry-After', '60');
          throw Object.assign(new Error('You are sending replies too quickly. Your reply is saved; retry in about a minute.'), { status: 429, code: 'request_rate_limited', retryAfterSeconds: 60 });
        }
        if (!(await consumeLimit(`trial-day:${id}`, Number(process.env.SPEAKNOW_TRIAL_DAILY_REQUESTS || 30), 86400000))) throw Object.assign(new Error('Today’s guest practice allowance is used. Sign in to continue with your account allowance.'), { status: 429, code: 'guest_allowance_exhausted' });
        if (!(await consumeLimit('ai-global-day', Number(process.env.SPEAKNOW_AI_GLOBAL_REQUESTS || 2000), 86400000)) || !(await consumeLimit('ai-global-tokens', Number(process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET || 2000000), 86400000, reserved))) throw Object.assign(new Error('The service allowance is temporarily exhausted. Your reply is saved; retry later.'), { status: 429, code: 'service_allowance_exhausted' });
        try { await handler(request, response); } finally { const measured = measuredAiTokens(request); if (measured !== null && measured < reserved) await releaseLimit('ai-global-tokens', reserved - measured).catch(error => console.error('Reserved budget refund failed:', error.message)); }
      });
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 500).json({
        error: error.status ? error.message : 'Trial service unavailable. Your practice remains on this device.', code: error.code || 'trial_unavailable', resetsAt: error.resetsAt, membershipPath: error.membershipPath, retryAfterSeconds: error.retryAfterSeconds
      });
    }
  };
}
