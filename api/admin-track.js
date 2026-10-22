import { appendAdminEvent, deleteAdminRecord, listAdminData } from "./_adminStore.js";
import { protectedApi } from "./_apiGuard.js";
import { authenticate } from "./_auth.js";
import { getOwned } from "./_appStore.js";

async function handler(req, res) {
  if (req.method === "GET") {
    await authenticate(req, { admin: true });
    const db = await listAdminData();
    res.status(200).json(db);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = req.body || {};
    if (payload.action === "delete_record") {
      await authenticate(req, { admin: true });
      const result = await deleteAdminRecord(payload);
      res.status(200).json({ ok: true, ...result });
      return;
    }
    const collection = { voice_session_saved: 'voiceSessions', presentation_session_saved: 'presentationSessions' }[payload.type];
    let eventPayload = payload.payload || {};
    if (collection) {
      const session = await getOwned(collection, req.user.id, eventPayload.session?.id);
      if (!session) return res.status(404).json({ error: 'Practice not found' });
      eventPayload = { ...eventPayload, session };
    }
    const result = await appendAdminEvent({ ...payload, payload: eventPayload, user: { id: req.user.id, full_name: req.user.full_name, email: req.user.email, role: req.user.role }, timestamp: new Date().toISOString() });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("admin-track error:", error);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Failed to record admin event" });
  }
}

export default protectedApi(handler);
