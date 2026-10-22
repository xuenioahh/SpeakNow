import { mutateAdminDb, readAdminDb } from "./_adminDb.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FORCE_LOCAL_DATA = /^(1|true|yes)$/i.test(String(process.env.FORCE_LOCAL_DATA || ""));

const TABLES = {
  users: "admin_users",
  events: "admin_events",
  voiceSessions: "admin_voice_sessions",
  presentationSessions: "admin_presentation_sessions",
};

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

  return response.status === 204 ? null : response.json();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUser(payload = {}) {
  if (!payload?.id) return null;
  return {
    id: payload.id,
    full_name: payload.full_name || "",
    email: payload.email || "",
    role: payload.role || "learner",
    avatar_url: payload.avatar_url || "",
    created_date: payload.created_date || new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
}

export async function listAdminData() {
  if (!hasSupabase()) {
    const db = await readAdminDb();
    return {
      provider: "local-json",
      ...db,
    };
  }

  try {
    const [users, events, voiceSessions, presentationSessions] = await Promise.all([
      supabaseRequest(TABLES.users, { query: "select=*&order=last_seen_at.desc" }),
      supabaseRequest(TABLES.events, { query: "select=*&order=timestamp.desc&limit=200" }),
      supabaseRequest(TABLES.voiceSessions, { query: "select=*&order=created_date.desc&limit=100" }),
      supabaseRequest(TABLES.presentationSessions, { query: "select=*&order=created_date.desc&limit=100" }),
    ]);

    return {
      provider: "supabase",
      users,
      events,
      voiceSessions,
      presentationSessions,
    };
  } catch {
    throw Object.assign(new Error("Persistent admin storage is unavailable; no local fallback was used."), { status: 503 });
  }
}

export async function appendAdminEvent({ type = "event", user, payload = {}, timestamp }) {
  const safeUser = normalizeUser(user);
  const eventTimestamp = timestamp || new Date().toISOString();

  if (!hasSupabase()) {
    const db = await mutateAdminDb((current) => {
      const next = {
        users: [...current.users],
        events: [...current.events],
        voiceSessions: [...current.voiceSessions],
        presentationSessions: [...current.presentationSessions],
      };

      if (safeUser) {
        const index = next.users.findIndex((entry) => entry.id === safeUser.id);
        if (index >= 0) {
          next.users[index] = {
            ...next.users[index],
            ...safeUser,
            last_seen_at: eventTimestamp,
          };
        } else {
          next.users.unshift({
            ...safeUser,
            last_seen_at: eventTimestamp,
          });
        }
      }

      next.events.unshift({
        id: createId("event"),
        type,
        timestamp: eventTimestamp,
        user_id: safeUser?.id || "",
        user_email: safeUser?.email || "",
        payload,
      });

      if (type === "voice_session_saved" && payload?.session) {
        next.voiceSessions.unshift(payload.session);
      }
      if (type === "presentation_session_saved" && payload?.session) {
        next.presentationSessions.unshift(payload.session);
      }

      return next;
    });

    return {
      provider: "local-json",
      counts: {
        users: db.users.length,
        events: db.events.length,
        voiceSessions: db.voiceSessions.length,
        presentationSessions: db.presentationSessions.length,
      },
    };
  }

  try {
    if (safeUser) {
      await supabaseRequest(TABLES.users, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: { ...safeUser, last_seen_at: eventTimestamp },
      });
    }

    await supabaseRequest(TABLES.events, {
      method: "POST",
      body: {
        id: createId("event"),
        type,
        timestamp: eventTimestamp,
        user_id: safeUser?.id || "",
        user_email: safeUser?.email || "",
        payload,
      },
    });

    if (type === "voice_session_saved" && payload?.session) {
      await supabaseRequest(TABLES.voiceSessions, {
        method: "POST",
        body: payload.session,
      });
    }

    if (type === "presentation_session_saved" && payload?.session) {
      await supabaseRequest(TABLES.presentationSessions, {
        method: "POST",
        body: payload.session,
      });
    }

    const data = await listAdminData();
    return {
      provider: "supabase",
      counts: {
        users: data.users.length,
        events: data.events.length,
        voiceSessions: data.voiceSessions.length,
        presentationSessions: data.presentationSessions.length,
      },
    };
  } catch {
    throw Object.assign(new Error("Persistent admin write failed; no local fallback was used."), { status: 503 });
  }
}

export async function deleteAdminRecord({ collection, id }) {
  if (!id || !["events", "voiceSessions", "presentationSessions"].includes(collection)) {
    throw Object.assign(new Error("A supported collection and record id are required"), { status: 400 });
  }

  if (!hasSupabase()) {
    const db = await mutateAdminDb((current) => {
      const next = {
        users: [...current.users],
        events: [...current.events],
        voiceSessions: [...current.voiceSessions],
        presentationSessions: [...current.presentationSessions],
      };

      if (collection === "events") {
        next.events = next.events.filter((entry) => entry.id !== id);
      } else if (collection === "voiceSessions") {
        next.voiceSessions = next.voiceSessions.filter((entry) => entry.id !== id);
      } else if (collection === "presentationSessions") {
        next.presentationSessions = next.presentationSessions.filter((entry) => entry.id !== id);
      } else {
        throw new Error("Unsupported collection");
      }

      return next;
    });

    return {
      provider: "local-json",
      counts: {
        users: db.users.length,
        events: db.events.length,
        voiceSessions: db.voiceSessions.length,
        presentationSessions: db.presentationSessions.length,
      },
    };
  }

  const table = TABLES[collection];
  if (!table) {
    throw new Error("Unsupported collection");
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase DELETE ${table} failed: ${response.status} ${text}`);
    }

    const data = await listAdminData();
    return {
      provider: "supabase",
      counts: {
        users: data.users.length,
        events: data.events.length,
        voiceSessions: data.voiceSessions.length,
        presentationSessions: data.presentationSessions.length,
      },
    };
  } catch {
    throw Object.assign(new Error("Persistent admin delete failed; no local fallback was used."), { status: 503 });
  }
}
