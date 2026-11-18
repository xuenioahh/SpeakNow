import { protectedApi } from './_apiGuard.js';
import { listOwned } from './_appStore.js';
import { membershipSnapshot } from './_membership.js';
import { mergeLearningRecords, learningInsights } from '../src/lib/learningDashboard.js';
export async function handler(req, res) {
  if (req.body?.action && !['records', 'insights'].includes(req.body.action)) return res.status(400).json({ error: 'Unknown dashboard view.' });
  const access = await membershipSnapshot(req);
  if (req.body?.action === 'insights' && !access.detailedInsights) return res.status(403).json({ error: 'Extended insights are a VIP feature. Your records and basic feedback remain available.', code: 'vip_feature', membershipPath: '/membership' });
  const [voiceSessions, presentations] = await Promise.all([listOwned('voiceSessions', req.user.id), listOwned('presentationSessions', req.user.id)]);
  const records = mergeLearningRecords({ voiceSessions, presentations, ownerId: req.user.id });
  return res.status(200).json({ voiceSessions, presentations, ...(req.body?.action === 'insights' ? { insights: learningInsights(records) } : {}), detailedInsights: access.detailedInsights });
}
export default protectedApi(handler);
