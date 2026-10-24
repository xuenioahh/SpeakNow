import { createHash } from 'node:crypto';
import { checkOrigin, cookies } from './_auth.js';
import { protectedApi } from './_apiGuard.js';
import { consumeLimit } from './_securityStore.js';
import { requestContext } from './_requestContext.js';
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
      if (!(await consumeLimit(`trial-minute:${id}`, 8, 60000)) || !(await consumeLimit(`trial-day:${id}`, 30, 86400000)) || !(await consumeLimit('ai-global-day', Number(process.env.SPEAKNOW_AI_GLOBAL_REQUESTS || 2000), 86400000)) || !(await consumeLimit('ai-global-tokens', Number(process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET || 2000000), 86400000, 100000))) throw Object.assign(new Error('Trial limit reached. Sign in or try again later.'), {
        status: 429
      });
      res.setHeader('Cache-Control', 'no-store');
      await requestContext.run(req, () => handler(req, res));
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 500).json({
        error: error.status ? error.message : 'Trial service unavailable. Your practice remains on this device.'
      });
    }
  };
}
