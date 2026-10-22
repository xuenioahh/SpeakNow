import { mutateAppStore, readAppStore } from "./_appStore.js";
import { getUserByEmail, saveUser, listOwned, getOwned, saveOwned, deleteOwned, updateUserFields } from "./_appStore.js";
import { randomUUID } from "node:crypto";
import { authenticate, hashPassword, verifyPassword, issueSession, clearSession } from "./_auth.js";
import { limitLogin } from "./_apiGuard.js";
import { consumeLimit } from "./_securityStore.js";
import { validateProfilePatch } from "./_profilePatch.js";

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function sanitizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getConfiguredAdminEmails() {
  const raw = process.env.VITE_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((item) => sanitizeEmail(item))
    .filter(Boolean);
}

function getDbAdminEmails(db) {
  return Array.isArray(db?.settings?.adminEmails)
    ? db.settings.adminEmails.map((item) => sanitizeEmail(item)).filter(Boolean)
    : [];
}

function getMergedAdminEmails(db) {
  return [...new Set([...getConfiguredAdminEmails(), ...getDbAdminEmails(db)])];
}

function resolveRole(db, email, fallbackRole = "learner") {
  const normalizedEmail = sanitizeEmail(email);
  return getMergedAdminEmails(db).includes(normalizedEmail) ? "admin" : fallbackRole;
}

function toPublicUser(account) {
  if (!account) return null;
  const { password, ...safeUser } = account;
  return safeUser;
}

function sortByField(items, sort) {
  if (!sort) return items;
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    const left = new Date(a[field] || 0).getTime() || a[field] || 0;
    const right = new Date(b[field] || 0).getTime() || b[field] || 0;
    if (left === right) return 0;
    return desc ? (left < right ? 1 : -1) : left < right ? -1 : 1;
  });
}

function requireUser(_db, req) {
  if (!req.user) throw Object.assign(new Error("Authentication required"), { status: 401, code: "auth_required" });
  return req.user;
}

function requireAdmin(db, req) {
  const account = requireUser(db, req);
  const resolvedRole = resolveRole(db, account.email, account.role);
  if (resolvedRole !== "admin") {
    const error = new Error("Admin access required");
    error.code = "admin_required";
    throw error;
  }
  return account;
}

function getCollectionKey(entity) {
  const mapping = {
    VoiceSession: "voiceSessions",
    PresentationSession: "presentationSessions",
    ActivityRecord: "activityRecords",
  };
  return mapping[entity] || null;
}

function normalizeEntityData(entity, data = {}) {
  if (entity !== "ActivityRecord") {
    return data;
  }

  const {
    activity_type = "",
    created_date,
    user_id,
    ...payload
  } = data || {};

  return {
    activity_type,
    ...(payload && Object.keys(payload).length ? { payload } : {}),
  };
}

async function register(req, payload) {
  const email = sanitizeEmail(payload.email), full_name = String(payload.full_name || "").trim(), password = payload.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !full_name || full_name.length > 80 || typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('Use a valid email, a name of 1–80 characters and a password of 10–128 characters.');
  if (await getUserByEmail(email)) throw Object.assign(new Error('This email is already registered'), { status: 409 });
  const db = await readAppStore();
  const user = { id: createId('user'), email, full_name, password: await hashPassword(password), role: resolveRole(db, email), avatar_url: '', profile_preferences: { weekly_goal: 3, practice_focus: 'voice' }, created_date: new Date().toISOString() };
  await saveUser(user, { insert: true }); req.user = user;
  return toPublicUser(user);
}
async function login(req, payload) {
  const user = await getUserByEmail(sanitizeEmail(payload.email));
  if (typeof payload.password !== 'string' || payload.password.length > 128 || !user || !await verifyPassword(payload.password, user.password)) throw Object.assign(new Error('Incorrect email or password; legacy accounts require the documented password migration.'), { status: 401, code: 'invalid_credentials' });
  const db = await readAppStore();
  user.role = resolveRole(db, user.email, user.role);
  await saveUser(user); req.user = user;
  return toPublicUser(user);
}
async function me(req) { return toPublicUser(requireUser(null, req)); }
async function updateMe(req, payload) {
  const patch = validateProfilePatch(payload);
  const user = await updateUserFields(requireUser(null, req).id, patch);
  return toPublicUser(user);
}
async function listEntity(req, payload) {
  const current = requireUser(null, req), collection = getCollectionKey(payload.entity);
  if (!collection) throw new Error('Unknown entity');
  const items = sortByField(await listOwned(collection, current.id), payload.sort || '-created_date');
  return typeof payload.limit === 'number' ? items.slice(0, Math.max(0, Math.min(payload.limit, 1000))) : items;
}
async function getEntity(req, payload) {
  const current = requireUser(null, req), collection = getCollectionKey(payload.entity);
  if (!collection) throw new Error('Unknown entity');
  const value = await getOwned(collection, current.id, payload.id);
  if (!value) throw Object.assign(new Error('Practice not found'), { status: 404 });
  return value;
}
async function createEntity(req, payload) {
  const current = requireUser(null, req), collection = getCollectionKey(payload.entity);
  if (!collection) throw new Error('Unknown entity');
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data) || JSON.stringify(payload.data).length > 300000) throw new Error('Invalid or oversized practice record');
  const data = normalizeEntityData(payload.entity, payload.data);
  const { id: ignoredId, user_id: ignoredOwner, created_date: ignoredDate, ...safe } = data;
  if (payload.entity === 'PresentationSession' && safe.report?.impact) throw new Error('Impact practices must use the verified presentation save interface.');
  if (safe.report) safe.report = { ...safe.report, source: safe.report.source === 'fallback' ? 'fallback' : 'heuristic', measurement_basis: 'unverified-client-estimate' };
  return saveOwned(collection, current.id, { ...safe, id: createId(collection), created_date: new Date().toISOString() });
}
async function deleteEntity(req, payload) {
  const current = requireUser(null, req), collection = getCollectionKey(payload.entity);
  if (!collection) throw new Error('Unknown entity');
  await deleteOwned(collection, current.id, payload.id); return { ok: true };
}

async function listAdminSettings(req) {
  const db = await readAppStore();
  requireAdmin(db, req);
  return {
    envAdminEmails: getConfiguredAdminEmails(),
    savedAdminEmails: getDbAdminEmails(db),
    adminEmails: getMergedAdminEmails(db),
  };
}

async function addAdminEmail(req, payload) {
  const normalizedEmail = sanitizeEmail(payload?.email);
  if (!normalizedEmail) {
    throw new Error("Admin email is required");
  }

  let result = null;
  await mutateAppStore((db) => {
    requireAdmin(db, req);
    const current = getDbAdminEmails(db);
    if (!current.includes(normalizedEmail)) {
      db.settings.adminEmails = [...current, normalizedEmail];
    }

    db.users = db.users.map((user) =>
      user.email === normalizedEmail
        ? { ...user, role: "admin" }
        : user
    );

    result = {
      envAdminEmails: getConfiguredAdminEmails(),
      savedAdminEmails: getDbAdminEmails(db),
      adminEmails: getMergedAdminEmails(db),
    };
    return db;
  });

  return result;
}

async function removeAdminEmail(req, payload) {
  const normalizedEmail = sanitizeEmail(payload?.email);
  if (!normalizedEmail) {
    throw new Error("Admin email is required");
  }

  let result = null;
  await mutateAppStore((db) => {
    requireAdmin(db, req);
    db.settings.adminEmails = getDbAdminEmails(db).filter((email) => email !== normalizedEmail);
    db.users = db.users.map((user) =>
      user.email === normalizedEmail
        ? { ...user, role: resolveRole(db, user.email, "learner") }
        : user
    );

    result = {
      envAdminEmails: getConfiguredAdminEmails(),
      savedAdminEmails: getDbAdminEmails(db),
      adminEmails: getMergedAdminEmails(db),
    };
    return db;
  });

  return result;
}

const ACTIONS = {
  register,
  login,
  me,
  updateMe,
  listEntity,
  getEntity,
  createEntity,
  deleteEntity,
  listAdminSettings,
  addAdminEmail,
  removeAdminEmail,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const payload = req.body || {};
    const { action: actionName, ...fields } = payload;
    if (['register', 'login'].includes(actionName)) await limitLogin(req);
    else {
      await authenticate(req);
      if (!await consumeLimit(`data:${req.user.id}`, 180, 60000)) throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
    }
    if (actionName === 'logout') { await clearSession(req, res); return res.status(200).json({ ok: true }); }
    const action = Object.hasOwn(ACTIONS, actionName) ? ACTIONS[actionName] : null;
    if (!action) return res.status(400).json({ error: 'Unknown action' });
    const data = await action(req, fields);
    if (['register', 'login'].includes(actionName)) { await clearSession(req, res); await issueSession(req.user, res); }
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(error.status || (error.code === 'admin_required' ? 403 : 400)).json({ error: error.message || 'Request failed', code: error.code || 'request_failed' });
  }
}
