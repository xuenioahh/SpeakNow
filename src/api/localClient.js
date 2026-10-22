import { apiFetch } from "@/api/http";
import { localStore } from "@/lib/localStore";
import { emitActivitySync } from "@/lib/activitySync";
import {
  generateConversationReply,
  generateVoiceReport,
} from "@/lib/localReports";
import { getScenario } from "@/lib/scenarios";

function redirectTo(path) {
  if (typeof window !== "undefined" && path) {
    window.location.href = path;
  }
}

async function apiRequest(action, payload = {}) {
  const response = await apiFetch("/api/local-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    /** @type {Error & { code?: string }} */
    const error = new Error(result?.error || `Request failed with ${response.status}`);
    if (result?.code) {
      error.code = result.code;
    }
    throw error;
  }

  return result.data;
}

function buildEntityStore(entity, prefix) {
  return {
    async list(sort, limit) {
      return apiRequest("listEntity", { entity, sort, limit });
    },
    async create(payload) {
      const created = await apiRequest("createEntity", { entity, prefix, data: payload });
      emitActivitySync({ type: "entity:create" });
      return created;
    },
    async delete(id) {
      await apiRequest("deleteEntity", { entity, id });
      emitActivitySync({ type: "entity:delete" });
    },
  };
}

async function syncAdminEvent(type, payload = {}) {
  try {
    const user = await apiRequest("me").catch(() => null);
    await apiFetch("/api/admin-track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        user,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Failed to sync admin event:", error);
  }
}

/**
 * @typedef {{
 *   prompt?: string,
 *   input?: {
 *     kind?: string,
 *     [key: string]: any
 *   }
 * }} InvokeLlmRequest
 */

export const localApi = {
  auth: {
    async me() {
      return apiRequest("me");
    },
    async updateMe(patch) {
      const updated = await apiRequest("updateMe", patch);
      emitActivitySync({ type: "user:update" });
      await syncAdminEvent("user_updated", { patch, user: updated });
      return updated;
    },
    async login(payload) {
      const loggedIn = await apiRequest("login", payload);
      localStore.session.setCurrentUserId(loggedIn?.id || "");
      emitActivitySync({ type: "auth:login" });
      await syncAdminEvent("user_logged_in", { email: loggedIn?.email || payload?.email || "" });
      return loggedIn;
    },
    async register(payload) {
      const registered = await apiRequest("register", payload);
      localStore.session.setCurrentUserId(registered?.id || "");
      emitActivitySync({ type: "auth:register" });
      await syncAdminEvent("user_registered", { email: registered?.email || payload?.email || "" });
      return registered;
    },
    async logout(redirectPath = "/") {
      await apiRequest("logout");
      localStore.session.clearCurrentUserId();
      emitActivitySync({ type: "auth:logout" });
      redirectTo(redirectPath);
    },
    redirectToLogin(redirectPath = "/auth") {
      redirectTo(redirectPath);
    },
  },
  admin: {
    async listSettings() {
      return apiRequest("listAdminSettings");
    },
    async addEmail(email) {
      return apiRequest("addAdminEmail", { email });
    },
    async removeEmail(email) {
      return apiRequest("removeAdminEmail", { email });
    },
    async deleteRecord(collection, id, _adminKey = "") {
      const response = await apiFetch("/api/admin-track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
            },
        body: JSON.stringify({
          action: "delete_record",
          collection,
          id,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || `Delete failed with ${response.status}`);
      }
      return result;
    },
  },
  entities: {
    VoiceSession: {
      ...buildEntityStore("VoiceSession", "voice"),
      async create(payload) {
        const created = await apiRequest("createEntity", {
          entity: "VoiceSession",
          prefix: "voice",
          data: payload,
        });
        void syncAdminEvent("voice_session_saved", { session: created });
        emitActivitySync({ type: "entity:create" });
        return created;
      },
    },
    PresentationSession: {
      ...buildEntityStore("PresentationSession", "presentation"),
      async create(payload) {
        const created = await apiRequest("createEntity", {
          entity: "PresentationSession",
          prefix: "presentation",
          data: payload,
        });
        void syncAdminEvent("presentation_session_saved", { session: created });
        emitActivitySync({ type: "entity:create" });
        return created;
      },
    },
    ActivityRecord: {
      ...buildEntityStore("ActivityRecord", "activity"),
      async create(payload) {
        const created = await apiRequest("createEntity", {
          entity: "ActivityRecord",
          prefix: "activity",
          data: payload,
        });
        void syncAdminEvent("activity_record_saved", { activity: created });
        emitActivitySync({ type: "entity:create" });
        return created;
      },
    },
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        const file_url = await localStore.fileToDataUrl(file);
        return { file_url };
      },
      async TrackActivity(payload) {
        const activity = await apiRequest("createEntity", {
          entity: "ActivityRecord",
          prefix: "activity",
          data: payload || {},
        });
        emitActivitySync({ type: "activity:track" });
        await syncAdminEvent("activity_tracked", { activity });
        return activity;
      },
      /**
       * @param {InvokeLlmRequest} request
       * @param {{ signal?: AbortSignal }} options
       */
      async InvokeLLM(request = {}, options = {}) {
        const { prompt, input } = request;
        const payload = input || {};

        if (payload.kind === "voice-chat") {
          const response = await apiFetch("/api/voice-chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: options.signal,
          });

          if (!response.ok) {
            throw new Error(`voice-chat request failed with ${response.status}`);
          }

          return response.json();
        }

        if (payload.kind === "voice-report") {
          return generateVoiceReport({
            messages: payload.messages || [],
            scoring: payload.scoring || "daily",
            duration: payload.duration || 0,
            words: payload.words || 0,
            exchanges: payload.exchanges || 0,
            scenarioTitle: payload.scenarioTitle || "Practice Session",
            mode: payload.mode || "basic",
            dialogMode: payload.dialogMode || "free_talk",
          });
        }

        if (payload.kind === "presentation-report") {
          const response = await apiFetch("/api/presentation-report", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`presentation-report request failed with ${response.status}`);
          }

          return response.json();
        }

        if (payload.kind === "presentation-analysis") {
          const response = await apiFetch("/api/presentation-analysis", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`presentation-analysis request failed with ${response.status}`);
          }

          return response.json();
        }

        if (payload.kind === "presentation-pause-feedback") {
          const response = await apiFetch("/api/presentation-pause-feedback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`presentation-pause-feedback request failed with ${response.status}`);
          }

          return response.json();
        }

        const scenario = getScenario(payload.scenarioId || "cafe");
        const scenarioData = payload.isGoalOriented
          ? scenario?.goalOriented
          : scenario?.freeTalk;

        return generateConversationReply({
          scenario,
          scenarioData,
          history: payload.history || [],
          userText: payload.userText || prompt || "Can you help me?",
          scoring: payload.scoring || "daily",
          mode: payload.mode || "basic",
          isGoalOriented: Boolean(payload.isGoalOriented),
        });
      },
    },
  },
};
