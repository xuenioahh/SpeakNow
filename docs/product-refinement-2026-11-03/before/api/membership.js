import { consumeLimit } from './_securityStore.js';
import { membershipSubject } from './_membership.js';
import { authenticate, cookies, checkOrigin } from './_auth.js';
import { membershipSnapshot, reservePractice, finishPractice, recordBrowserUsage } from './_membership.js';
import { startVipTrial, requestVip, adminMembership } from './_membershipActions.js';
export default async function membership(req, res) {
  try {
    checkOrigin(req);
    if (cookies(req).speaknow_session) await authenticate(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use a JSON POST request.' });
    if (!await consumeLimit(`membership:${membershipSubject(req)}`, 180, 60000)) throw Object.assign(new Error('Membership service is busy. Retry shortly.'), { status: 429 });
    res.setHeader('Cache-Control', 'no-store');
    const { action, id, taskId, kind } = req.body || {};
    if (action === 'measurement') return res.status(200).json(await recordBrowserUsage(req, req.body));
    if (action === 'status') return res.status(200).json(await membershipSnapshot(req));
    if (action === 'trial') { await startVipTrial(req); return res.status(200).json(await membershipSnapshot(req)); }
    if (action === 'request-upgrade') { await requestVip(req); return res.status(200).json(await membershipSnapshot(req)); }
    if (['admin-status', 'admin-grant', 'admin-revoke', 'admin-decline'].includes(action)) return res.status(200).json(await adminMembership(req));
    if (action === 'start') return res.status(200).json(await reservePractice(req, { id, taskId, kind }));
    if (action === 'finish' || action === 'cancel') return res.status(200).json(await finishPractice(req, id, action === 'cancel'));
    return res.status(400).json({ error: 'Unsupported membership action.' });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Membership information is unavailable. Retry before starting practice.', code: error.code || 'membership_unavailable', resetsAt: error.resetsAt, membershipPath: error.membershipPath }); }
}
