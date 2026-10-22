import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { putSession, getSession, revokeSession } from './_securityStore.js';
import { getUserById } from './_appStore.js';
const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');
export const cookieName = 'speaknow_session';
export function authError(message = 'Authentication required', status = 401) { return Object.assign(new Error(message), { status, code: status === 401 ? 'auth_required' : 'access_denied' }); }
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (!encoded?.startsWith('scrypt$')) return false;
  const [kind, n, r, p, salt, expected] = encoded.split('$');
  if (kind !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(value => { const at = value.indexOf('='); return [value.slice(0, at).trim(), value.slice(at + 1)]; }));
}
const secure = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
function sessionCookies(token, csrf, maxAge) {
  const flags = `Path=/; SameSite=Strict; Max-Age=${maxAge}${secure() ? '; Secure' : ''}`;
  return [`${cookieName}=${token}; HttpOnly; ${flags}`, `speaknow_csrf=${csrf}; ${flags}`];
}
export async function issueSession(user, res) {
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  const ttl = 8 * 60 * 60;
  await putSession(hash(token), { user_id: user.id, csrf_hash: hash(csrf), expires_at: new Date(Date.now() + ttl * 1000).toISOString() });
  res.setHeader('Set-Cookie', sessionCookies(token, csrf, ttl));
}
export async function clearSession(req, res) {
  const token = cookies(req)[cookieName];
  if (token) await revokeSession(hash(token));
  res.setHeader('Set-Cookie', sessionCookies('', '', 0));
}
export function checkOrigin(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') throw authError('Cross-site request rejected', 403);
  const origin = req.headers?.origin;
  if (origin) {
    const url = new URL(origin);
    const allowed = process.env.SPEAKNOW_ORIGIN;
    if (allowed ? origin !== allowed : url.host !== req.headers.host) throw authError('Origin rejected', 403);
  }
}
export async function authenticate(req, { admin = false } = {}) {
  checkOrigin(req);
  const token = cookies(req)[cookieName];
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw authError();
  const session = await getSession(hash(token));
  if (!session || Date.parse(session.expires_at) <= Date.now()) throw authError();
  if (!['GET', 'HEAD'].includes(req.method)) {
    const csrf = req.headers['x-csrf-token'];
    if (!/^[a-f0-9]{64}$/.test(csrf || '') || hash(csrf) !== session.csrf_hash) throw authError('CSRF verification failed', 403);
  }
  const user = await getUserById(session.user_id);
  if (!user) throw authError();
  if (admin && user.role !== 'admin') throw authError('Admin access required', 403);
  req.user = user; return user;
}
