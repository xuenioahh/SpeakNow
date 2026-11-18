import { ALL_QUESTION_SETS } from '../shared/questionBank.js';
import { getSpeakingTask } from '../shared/speakingTasks.js';
import { effectivePlan, paywallEnabled } from './_plans.js';
const list = name => String(process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
export function ownsPrivateBank(req) {
  if (req.user?.role === 'admin' || list('SPEAKNOW_PRIVATE_BANK_OWNER_IDS').includes(req.user?.id)) return true;
  // A local development copy of the uploader's sources is not a public catalogue.
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
}
export function catalogueFor(req, membership) {
  const owns = ownsPrivateBank(req), licensed = /^(1|true)$/i.test(process.env.SPEAKNOW_BANK_RIGHTS_VERIFIED || '');
  const full = owns || licensed && (effectivePlan(membership) === 'vip' || !paywallEnabled());
  return { sets: ALL_QUESTION_SETS.filter(set => full ? !set.isDemo : set.isDemo), fullMockTaskId: full ? 'ielts-full-mock-bank-v1' : 'ielts-full-mock-demo-v1',
    access: { fullQuestionBank: full, sourceAccess: owns ? 'private-owner' : licensed ? 'licensed' : 'original-trial', importedSourcesPublic: licensed } };
}
export function assertTaskAccess(req, id, membership) {
  const task = getSpeakingTask(id);
  if (!task) throw Object.assign(new Error('Unknown practice task.'), { status: 400 });
  if (task.source.kind === 'original') return task;
  const owns = ownsPrivateBank(req), licensed = /^(1|true)$/i.test(process.env.SPEAKNOW_BANK_RIGHTS_VERIFIED || '');
  if (!owns && !(licensed && (effectivePlan(membership) === 'vip' || !paywallEnabled()))) throw Object.assign(new Error('This source bank is private. Original practice remains available.'), { status: 403, code: 'bank_access_required' });
  return task;
}
