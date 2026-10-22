import { mutateAppDb, readAppDb } from "./_appDb.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FORCE_LOCAL_DATA = /^(1|true|yes)$/i.test(String(process.env.FORCE_LOCAL_DATA || ""));

const TABLES = {
  users: "app_users",
  voiceSessions: "app_voice_sessions",
  presentationSessions: "app_presentation_sessions",
  activityRecords: "app_activity_records",
  settings: "app_settings",
};

export async function getUserById(id) {
  if (!hasSupabase()) return (await readAppDb()).users.find(user => user.id === id) || null;
  return (await supabaseRequest(TABLES.users, { query: `select=*&id=eq.${encodeURIComponent(id)}` }))[0] || null;
}
export async function getUserByEmail(email) {
  if (!hasSupabase()) return (await readAppDb()).users.find(user => user.email === email) || null;
  return (await supabaseRequest(TABLES.users, { query: `select=*&email=eq.${encodeURIComponent(email)}` }))[0] || null;
}
export async function saveUser(user, { insert = false } = {}) {
  if (hasSupabase()) return supabaseRequest(TABLES.users, { method: 'POST', body: user, prefer: insert ? 'return=representation' : 'resolution=merge-duplicates,return=representation' });
  await mutateAppDb(db => {
    if (db.users.some(item => item.email === user.email && (insert || item.id !== user.id))) throw Object.assign(new Error('This email is already registered'), { status: 409 });
    const index = db.users.findIndex(item => item.id === user.id);
    if (index === -1) db.users.unshift(user); else db.users[index] = user;
    return db;
  });
}
export async function listOwned(collection, owner) {
  if (!TABLES[collection] || collection === 'users' || collection === 'settings') throw new Error('Invalid collection');
  if (!hasSupabase()) return (await readAppDb())[collection].filter(item => item.user_id === owner);
  return supabaseRequest(TABLES[collection], { query: `select=*&user_id=eq.${encodeURIComponent(owner)}&order=created_date.desc` });
}
export async function getOwned(collection, owner, id) {
  if (!hasSupabase()) return (await listOwned(collection, owner)).find(item => item.id === id) || null;
  return (await supabaseRequest(TABLES[collection], { query: `select=*&user_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}` }))[0] || null;
}
export async function saveOwned(collection, owner, record, { update = false } = {}) {
  if (update && !await getOwned(collection, owner, record.id)) throw Object.assign(new Error('Practice not found'), { status: 404 });
  const value = { ...record, user_id: owner };
  if (hasSupabase()) {
    if (update) await supabaseRequest(TABLES[collection], { method: 'PATCH', query: `id=eq.${encodeURIComponent(record.id)}&user_id=eq.${encodeURIComponent(owner)}`, body: value });
    else await supabaseRequest(TABLES[collection], { method: 'POST', body: value });
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
  if (hasSupabase()) await supabaseRequest(TABLES[collection], { method: 'DELETE', query: `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(owner)}` });
  else await mutateAppDb(db => { db[collection] = db[collection].filter(item => !(item.id === id && item.user_id === owner)); return db; });
}

export async function updateUserFields(id, patch) {
  if (hasSupabase()) return (await supabaseRequest(TABLES.users, { method: 'PATCH', query: `id=eq.${encodeURIComponent(id)}`, body: patch }))[0];
  let result;
  await mutateAppDb(db => { const index = db.users.findIndex(user => user.id === id); if (index < 0) throw Object.assign(new Error('User not found'), { status: 404 }); db.users[index] = { ...db.users[index], ...patch }; result = db.users[index]; return db; });
  return result;
}
export async function updateImpact(owner, id, operation, patch) {
  if (hasSupabase()) {
    const value = await supabaseRequest('rpc/speaknow_update_impact', { method: 'POST', body: { owner_id: owner, practice_id: id, operation, patch } });
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

function hasSupabase() {
  return !FORCE_LOCAL_DATA && Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseRequest(table, { method = "GET", query = "", body, prefer } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: prefer || (method === "GET" ? "count=exact" : "return=representation"),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${method} ${table} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
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
    const rows = await supabaseRequest(TABLES.settings, {
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
    await supabaseRequest(TABLES.settings, {
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
  if (!hasSupabase()) {
    return toLocalShape(await readAppDb());
  }

  try {
    const [users, voiceSessions, presentationSessions, activityRecords, settings] = await Promise.all([
      supabaseRequest(TABLES.users, { query: "select=*&order=created_date.desc" }),
      supabaseRequest(TABLES.voiceSessions, { query: "select=*&order=created_date.desc" }),
      supabaseRequest(TABLES.presentationSessions, { query: "select=*&order=created_date.desc" }),
      supabaseRequest(TABLES.activityRecords, { query: "select=*&order=created_date.desc" }),
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
  if (!hasSupabase()) {
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
        supabaseRequest(TABLES.users, {
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
          supabaseRequest(TABLES.users, {
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
          supabaseRequest(table, {
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
            supabaseRequest(table, {
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
