import { mutateAdminDb, readAdminDb } from "./_adminDb.js";
import { securityRequest } from './_securityStore.js';

import { hasRemoteStorage, storageProvider } from './_storageProvider.js';

const TABLES = {
  users: "admin_users",
  events: "admin_events",
  voiceSessions: "admin_voice_sessions",
  presentationSessions: "admin_presentation_sessions",
};



async function persistentRequest(table, { method = "GET", query = "", body, prefer } = {}) {
  return securityRequest(table, { method, query, body, prefer: prefer || (method === 'GET' ? 'count=exact' : 'return=representation') });
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
  if (!hasRemoteStorage()) {
    const db = await readAdminDb();
    return {
      provider: "local-json",
      ...db,
    };
  }

  try {
    const [users, events, voiceSessions, presentationSessions] = await Promise.all([
      persistentRequest(TABLES.users, { query: "select=*&order=last_seen_at.desc" }),
      persistentRequest(TABLES.events, { query: "select=*&order=timestamp.desc&limit=200" }),
      persistentRequest(TABLES.voiceSessions, { query: "select=*&order=created_date.desc&limit=100" }),
      persistentRequest(TABLES.presentationSessions, { query: "select=*&order=created_date.desc&limit=100" }),
    ]);

    return {
      provider: storageProvider(),
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

  if (!hasRemoteStorage()) {
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
      await persistentRequest(TABLES.users, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: { ...safeUser, last_seen_at: eventTimestamp },
      });
    }

    await persistentRequest(TABLES.events, {
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
      await persistentRequest(TABLES.voiceSessions, {
        method: "POST",
        body: payload.session,
      });
    }

    if (type === "presentation_session_saved" && payload?.session) {
      await persistentRequest(TABLES.presentationSessions, {
        method: "POST",
        body: payload.session,
      });
    }

    const data = await listAdminData();
    return {
      provider: storageProvider(),
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

  if (!hasRemoteStorage()) {
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
    await persistentRequest(table, { method: 'DELETE', query: `id=eq.${encodeURIComponent(id)}` });

    const data = await listAdminData();
    return {
      provider: storageProvider(),
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
