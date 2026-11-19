import { mutateAppDb, readAppDb } from "./_appDb.js";
import { securityRequest } from './_securityStore.js';

import { hasRemoteStorage, storageProvider } from './_storageProvider.js';

const TABLES = {
  users: "app_users",
  voiceSessions: "app_voice_sessions",
  presentationSessions: "app_presentation_sessions",
  activityRecords: "app_activity_records",
  settings: "app_settings",
};

export async function getUserById(id) {
  if (!hasRemoteStorage()) return (await readAppDb()).users.find(user => user.id === id) || null;
  return (await persistentRequest(TABLES.users, { query: `select=*&id=eq.${encodeURIComponent(id)}` }))[0] || null;
}
export async function listAccountSummaries() {
  const users = hasRemoteStorage() ? await persistentRequest(TABLES.users, { query: 'select=id,email,full_name,role,avatar_url,created_date&order=created_date.desc' }) : (await readAppDb()).users;
  return users.map(user => ({ id: user.id, email: user.email, full_name: user.full_name || '', role: user.role || 'learner', avatar_url: user.avatar_url || '', created_date: user.created_date }));
}
export async function getUserByEmail(email) {
  if (!hasRemoteStorage()) return (await readAppDb()).users.find(user => user.email === email) || null;
  return (await persistentRequest(TABLES.users, { query: `select=*&email=eq.${encodeURIComponent(email)}` }))[0] || null;
}
export async function saveUser(user, { insert = false } = {}) {
  if (hasRemoteStorage()) return persistentRequest(TABLES.users, { method: 'POST', body: user, prefer: insert ? 'return=representation' : 'resolution=merge-duplicates,return=representation' });
  await mutateAppDb(db => {
    if (db.users.some(item => item.email === user.email && (insert || item.id !== user.id))) throw Object.assign(new Error('This email is already registered'), { status: 409 });
    const index = db.users.findIndex(item => item.id === user.id);
    if (index === -1) db.users.unshift(user); else db.users[index] = user;
    return db;
  });
}
export async function listOwned(collection, owner) {
  if (!TABLES[collection] || collection === 'users' || collection === 'settings') throw new Error('Invalid collection');
  if (!hasRemoteStorage()) return (await readAppDb())[collection].filter(item => item.user_id === owner);
  return persistentRequest(TABLES[collection], { query: `select=*&user_id=eq.${encodeURIComponent(owner)}&order=created_date.desc` });
}
export async function getOwned(collection, owner, id) {
  if (!hasRemoteStorage()) return (await listOwned(collection, owner)).find(item => item.id === id) || null;
  return (await persistentRequest(TABLES[collection], { query: `select=*&user_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}` }))[0] || null;
}
export async function saveOwned(collection, owner, record, { update = false } = {}) {
  if (update && !await getOwned(collection, owner, record.id)) throw Object.assign(new Error('Practice not found'), { status: 404 });
  const value = { ...record, user_id: owner };
  if (hasRemoteStorage()) {
    if (update) await persistentRequest(TABLES[collection], { method: 'PATCH', query: `id=eq.${encodeURIComponent(record.id)}&user_id=eq.${encodeURIComponent(owner)}`, body: value });
    else await persistentRequest(TABLES[collection], { method: 'POST', body: value });
  } else await mutateAppDb(db => {
    const index = db[collection].findIndex(item => item.id === value.id && item.user_id === owner);
    if (update) { if (index === -1) throw Object.assign(new Error('Practice not found'), { status: 404 }); db[collection][index] = value; }
    else { if (db[collection].some(item => item.id === value.id)) throw Object.assign(new Error('Practice already exists'), { status: 409 }); db[collection].unshift(value); }
    return db;
  });
  return value;
}
export async function deleteOwned(collection, owner, id) {
  if (!await getOwned(collection, owner, id)) throw Object.assign(new Error('Practice not found'), { status: 404 });
  if (hasRemoteStorage()) await persistentRequest(TABLES[collection], { method: 'DELETE', query: `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(owner)}` });
  else await mutateAppDb(db => { db[collection] = db[collection].filter(item => !(item.id === id && item.user_id === owner)); return db; });
}

export async function updateUserFields(id, patch) {
  if (hasRemoteStorage()) return (await persistentRequest(TABLES.users, { method: 'PATCH', query: `id=eq.${encodeURIComponent(id)}`, body: patch }))[0];
  let result;
  await mutateAppDb(db => { const index = db.users.findIndex(user => user.id === id); if (index < 0) throw Object.assign(new Error('User not found'), { status: 404 }); db.users[index] = { ...db.users[index], ...patch }; result = db.users[index]; return db; });
  return result;
}
export async function updateImpact(owner, id, operation, patch) {
  if (hasRemoteStorage()) {
    const value = await persistentRequest('rpc/speaknow_update_impact', { method: 'POST', body: { owner_id: owner, practice_id: id, operation, patch } });
    if (!value) throw Object.assign(new Error('Practice not found'), { status: 404 });
    return value;
  }
  let result;
  await mutateAppDb(db => {
    const session = db.presentationSessions.find(item => item.id === id && item.user_id === owner);
    if (!session?.report?.impact) throw Object.assign(new Error('Practice not found'), { status: 404 });
    const metadata = session.report.impact;
    if (operation === 'append') {
      const existing = metadata.recordings.find(recording => recording.id === patch.recording.id);
      if (existing) {
        if (existing.mime !== patch.recording.mime || existing.bytes !== patch.recording.bytes) throw Object.assign(new Error('The saved recording is immutable.'), { status: 409 });
        result = session; return db;
      }
      if (metadata.recordings.length >= 20) throw Object.assign(new Error('Recording limit reached'), { status: 400 });
      metadata.recordings.push(patch.recording); metadata.recordingIds.push(`${id}:${patch.recording.id}`);
    } else if (operation === 'analysis') {
      if (!metadata.analysis && !metadata.comparison) {
        Object.assign(metadata, patch); session.report.source = 'ai';
      }
    } else throw new Error('Invalid Impact update');
    result = session; return db;
  });
  return result;
}

function isMissingTableError(error, table) {
  if (error?.storageCode === 'PGRST205' && error.storageResource === table) return true;
  const message = String(error?.message || "");
  return message.includes("PGRST205") && message.includes(`public.${table}`);
}

function shouldFallbackToLocal(error) {
  const message = String(error?.message || error || "");
  return (
    message.startsWith("Supabase ") ||
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("network")
  );
}


export function appStorageMode() { return storageProvider(); }

async function persistentRequest(table, { method = "GET", query = "", body, prefer } = {}) {
  return securityRequest(table, { method, query, body, prefer: prefer || (method === 'GET' ? 'count=exact' : 'return=representation') });
}

function toLocalShape(db = {}) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    voiceSessions: Array.isArray(db.voiceSessions) ? db.voiceSessions : [],
    presentationSessions: Array.isArray(db.presentationSessions) ? db.presentationSessions : [],
    activityRecords: Array.isArray(db.activityRecords) ? db.activityRecords : [],
    settings: {
      adminEmails: Array.isArray(db.settings?.adminEmails) ? db.settings.adminEmails : [],
    },
  };
}

async function readSupabaseSettings() {
  try {
    const rows = await persistentRequest(TABLES.settings, {
      query: "select=key,value&key=eq.adminEmails",
    });
    return Array.isArray(rows) && rows[0]?.value
      ? { adminEmails: Array.isArray(rows[0].value) ? rows[0].value : [] }
      : { adminEmails: [] };
  } catch (error) {
    if (isMissingTableError(error, TABLES.settings)) {
      console.warn(
        `Supabase table public.${TABLES.settings} is missing; falling back to empty app settings.`
      );
      return { adminEmails: [] };
    }
    throw error;
  }
}

async function writeSupabaseSettings(settings) {
  try {
    await persistentRequest(TABLES.settings, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        key: "adminEmails",
        value: Array.isArray(settings?.adminEmails) ? settings.adminEmails : [],
      },
    });
  } catch (error) {
    if (isMissingTableError(error, TABLES.settings)) {
      console.warn(
        `Supabase table public.${TABLES.settings} is missing; skipping app settings write.`
      );
      return;
    }
    throw error;
  }
}

export async function readAppStore() {
  if (!hasRemoteStorage()) {
    return toLocalShape(await readAppDb());
  }

  try {
    const [users, voiceSessions, presentationSessions, activityRecords, settings] = await Promise.all([
      persistentRequest(TABLES.users, { query: "select=*&order=created_date.desc" }),
      persistentRequest(TABLES.voiceSessions, { query: "select=*&order=created_date.desc" }),
      persistentRequest(TABLES.presentationSessions, { query: "select=*&order=created_date.desc" }),
      persistentRequest(TABLES.activityRecords, { query: "select=*&order=created_date.desc" }),
      readSupabaseSettings(),
    ]);

    return toLocalShape({
      users,
      voiceSessions,
      presentationSessions,
      activityRecords,
      settings,
    });
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      throw Object.assign(new Error("Persistent storage unavailable; no local fallback was used."), { status: 503 });
    }
    throw error;
  }
}

export async function mutateAppStore(mutator) {
  if (!hasRemoteStorage()) {
    return toLocalShape(await mutateAppDb(async db => await mutator(toLocalShape(db)) || db));
  }

  try {
    const current = await readAppStore();
    const next = (await mutator(structuredClone(current))) || current;

    const previousUsers = new Map(current.users.map((entry) => [entry.id, entry]));
    const nextUsers = new Map(next.users.map((entry) => [entry.id, entry]));

    const collections = [
      ["voiceSessions", TABLES.voiceSessions],
      ["presentationSessions", TABLES.presentationSessions],
      ["activityRecords", TABLES.activityRecords],
    ];

    await Promise.all(
      [...nextUsers.values()].filter(entry => JSON.stringify(entry) !== JSON.stringify(previousUsers.get(entry.id))).map((entry) =>
        persistentRequest(TABLES.users, {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=representation",
          body: entry,
        })
      )
    );

    await Promise.all(
      [...previousUsers.keys()]
        .filter((id) => !nextUsers.has(id))
        .map((id) =>
          persistentRequest(TABLES.users, {
            method: "DELETE",
            query: `id=eq.${encodeURIComponent(id)}`,
          })
        )
    );

    for (const [key, table] of collections) {
      const previousMap = new Map(current[key].map((entry) => [entry.id, entry]));
      const nextMap = new Map(next[key].map((entry) => [entry.id, entry]));

      await Promise.all(
        [...nextMap.values()].filter(entry => JSON.stringify(entry) !== JSON.stringify(previousMap.get(entry.id))).map((entry) =>
          persistentRequest(table, {
            method: "POST",
            prefer: "resolution=merge-duplicates,return=representation",
            body: entry,
          })
        )
      );

      await Promise.all(
        [...previousMap.keys()]
          .filter((id) => !nextMap.has(id))
          .map((id) =>
            persistentRequest(table, {
              method: "DELETE",
              query: `id=eq.${encodeURIComponent(id)}`,
            })
          )
      );
    }

    await writeSupabaseSettings(next.settings);
    return toLocalShape(next);
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      throw Object.assign(new Error("Persistent storage write failed; no local fallback was used."), { status: 503 });
    }
    throw error;
  }
}
