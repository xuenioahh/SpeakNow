import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Download, Mic, Plus, Presentation, RefreshCw, Search, Shield, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/AuthContext";
import { localApi } from "@/api/localClient";
import { toast } from "sonner";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("adminDashboardKey") || "");
  const [adminSettings, setAdminSettings] = useState({ adminEmails: [], envAdminEmails: [], savedAdminEmails: [] });
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [deletingKey, setDeletingKey] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showEvents, setShowEvents] = useState(false);
  const [showVoiceSessions, setShowVoiceSessions] = useState(false);
  const [showPresentationSessions, setShowPresentationSessions] = useState(false);

  const mergedAdminEmails = useMemo(() => adminSettings?.adminEmails || [], [adminSettings]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const headers = adminKey
        ? {
            "x-user-id": sessionStorage.getItem("speaknow_current_user_id") || "",
            "x-admin-key": adminKey,
          }
        : {
            "x-user-id": sessionStorage.getItem("speaknow_current_user_id") || "",
          };
      const [dashboardResponse, settings] = await Promise.all([
        fetch("/api/admin-track", { headers }),
        localApi.admin.listSettings(),
      ]);
      if (!dashboardResponse.ok) {
        throw new Error(`Admin request failed with ${dashboardResponse.status}`);
      }
      setData(await dashboardResponse.json());
      setAdminSettings(settings);
    } catch (loadError) {
      console.error("Failed to load admin dashboard:", loadError);
      setError(loadError?.message || "Failed to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadDashboard();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const handleSaveAdminKey = () => {
    sessionStorage.setItem("adminDashboardKey", adminKey);
    void loadDashboard();
  };

  const handleAddAdmin = async () => {
    try {
      setSavingAdmin(true);
      const next = await localApi.admin.addEmail(newAdminEmail);
      setAdminSettings(next);
      setNewAdminEmail("");
    } catch (saveError) {
      setError(saveError?.message || "Failed to add admin email.");
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (email) => {
    try {
      setSavingAdmin(true);
      const next = await localApi.admin.removeEmail(email);
      setAdminSettings(next);
    } catch (saveError) {
      setError(saveError?.message || "Failed to remove admin email.");
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDeleteRecord = async (collection, id) => {
    try {
      setDeletingKey(`${collection}:${id}`);
      await localApi.admin.deleteRecord(collection, id, adminKey);
      toast.success("Record deleted");
      await loadDashboard();
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete record.");
      toast.error(deleteError?.message || "Failed to delete record.");
    } finally {
      setDeletingKey("");
    }
  };

  const handleExportJson = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      provider,
      users,
      events,
      voiceSessions,
      presentationSessions,
      adminSettings,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `speaknow-admin-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  const users = data?.users || [];
  const events = data?.events || [];
  const voiceSessions = data?.voiceSessions || [];
  const presentationSessions = data?.presentationSessions || [];
  const provider = data?.provider || "unknown";
  const filteredUsers = users.filter((entry) => {
    const haystack = `${entry.full_name || ""} ${entry.email || ""} ${entry.role || ""}`.toLowerCase();
    return haystack.includes(userQuery.trim().toLowerCase());
  });
  const eventTypes = [...new Set(events.map((entry) => entry.type).filter(Boolean))];
  const filteredEvents = events.filter((entry) => {
    const haystack = `${entry.type || ""} ${entry.user_email || ""} ${entry.user_id || ""} ${JSON.stringify(entry.payload || {})}`.toLowerCase();
    const queryOk = haystack.includes(eventQuery.trim().toLowerCase());
    const typeOk = eventTypeFilter === "all" || entry.type === eventTypeFilter;
    return queryOk && typeOk;
  });
  const selectedUserVoiceSessions = selectedUser
    ? voiceSessions.filter((entry) => entry.user_id === selectedUser.id)
    : [];
  const selectedUserPresentationSessions = selectedUser
    ? presentationSessions.filter((entry) => entry.user_id === selectedUser.id)
    : [];
  const selectedUserEvents = selectedUser
    ? events.filter((entry) => entry.user_id === selectedUser.id || entry.user_email === selectedUser.email)
    : [];

  return (
    <div className="min-h-screen pb-12">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-space text-foreground">Admin Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Registrations, behavior events, and saved sessions
            </p>
          </div>
        </div>
        <Button onClick={() => void loadDashboard()} variant="outline" className="rounded-2xl border-white/10">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="px-4 space-y-4">
        {error && (
          <div className="glass rounded-2xl p-4">
            <p className="text-sm text-accent">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label="Registered Users" value={users.length} />
          <StatCard icon={Activity} label="Tracked Events" value={events.length} />
          <StatCard icon={Mic} label="Voice Sessions" value={voiceSessions.length} />
          <StatCard icon={Presentation} label="Presentation Sessions" value={presentationSessions.length} />
        </div>

        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-foreground">Storage Provider</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Current backend storage: <span className="text-foreground font-medium">{provider}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Signed in as <span className="text-foreground font-medium">{user?.email || "-"}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            `supabase` means server-side Postgres sync is active. `local-json` means this app is using the local file fallback.
          </p>
          <Button onClick={handleExportJson} variant="outline" className="rounded-2xl border-white/10 mt-4">
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
        </div>

        <div className="glass rounded-2xl p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Admin Accounts</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Add multiple admin emails here. Any user who registers or signs in with one of these emails will see `/admin`.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Current URL: <span className="text-foreground font-medium">/admin</span>
            </p>
          </div>

          <div className="flex gap-3">
            <Input
              type="email"
              value={newAdminEmail}
              onChange={(event) => setNewAdminEmail(event.target.value)}
              className="h-11 rounded-2xl bg-white/5 border-white/10"
              placeholder="new-admin@example.com"
            />
            <Button
              onClick={() => void handleAddAdmin()}
              disabled={savingAdmin || !newAdminEmail.trim()}
              className="rounded-2xl h-11 bg-gradient-to-r from-emerald-500 to-teal-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>

          <div className="space-y-2">
            {mergedAdminEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin emails configured yet.</p>
            ) : (
              mergedAdminEmails.map((email) => {
                const fromEnv = adminSettings.envAdminEmails?.includes(email);
                return (
                  <div key={email} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{email}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fromEnv ? "Seeded from .env" : "Saved in local app database"}
                      </p>
                    </div>
                    {!fromEnv ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={savingAdmin}
                        onClick={() => void handleRemoveAdmin(email)}
                        className="rounded-xl text-muted-foreground hover:text-accent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="glass rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Admin API Key</h2>
          <p className="text-sm text-muted-foreground">
            If `ADMIN_DASHBOARD_KEY` is set on the server, enter the same value here to unlock `/api/admin-track`.
          </p>
          <div className="flex gap-3">
            <Input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              className="h-11 rounded-2xl bg-white/5 border-white/10"
              placeholder="Optional admin dashboard key"
            />
            <Button onClick={handleSaveAdminKey} className="rounded-2xl h-11 bg-gradient-to-r from-violet-500 to-indigo-600">
              Save
            </Button>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Users</h2>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              className="h-11 rounded-2xl bg-white/5 border-white/10 pl-10"
              placeholder="Search users by name, email, or role"
            />
          </div>
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No synced users yet.</p>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUser(user)}
                  className="glass rounded-xl p-3 w-full text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{user.full_name || "Unnamed user"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{user.email || "-"}</p>
                      <p className="text-[11px] text-emerald-300 mt-1 capitalize">{user.role || "learner"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Last seen</p>
                      <p className="text-xs text-foreground mt-1">{formatDate(user.last_seen_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent Events</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredEvents.length} matched events
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowEvents((prev) => !prev)}
              className="rounded-2xl text-muted-foreground"
            >
              {showEvents ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              {showEvents ? "Collapse" : "Expand"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px] mb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
                className="h-11 rounded-2xl bg-white/5 border-white/10 pl-10"
                placeholder="Search events, users, or payload text"
              />
            </div>
            <select
              value={eventTypeFilter}
              onChange={(event) => setEventTypeFilter(event.target.value)}
              className="h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-foreground"
            >
              <option value="all">All event types</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {!showEvents ? (
            <div className="space-y-2">
              {filteredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                eventTypes.map((type) => {
                  const count = filteredEvents.filter((event) => event.type === type).length;
                  if (!count) return null;
                  return (
                    <div key={type} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{type}</p>
                      <p className="text-xs text-muted-foreground">{count} records</p>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                filteredEvents.slice(0, 50).map((event) => (
                  <div key={event.id} className="glass rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{event.type}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.user_email || event.user_id || "Unknown user"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingKey === `events:${event.id}`}
                          onClick={() => void handleDeleteRecord("events", event.id)}
                          className="rounded-xl text-muted-foreground hover:text-accent mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <pre className="mt-3 overflow-auto rounded-xl bg-black/20 p-3 text-[11px] text-muted-foreground">
{JSON.stringify(event.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Saved Session Data</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Voice Sessions</p>
                  <p className="text-xs text-muted-foreground mt-1">{voiceSessions.length} total records</p>
                </div>
                <Button variant="ghost" onClick={() => setShowVoiceSessions((prev) => !prev)} className="rounded-2xl text-muted-foreground">
                  {showVoiceSessions ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                  {showVoiceSessions ? "Collapse" : "Expand"}
                </Button>
              </div>
              {showVoiceSessions ? (
                <div className="mt-3 space-y-2">
                  {voiceSessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="rounded-xl bg-black/15 p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-foreground">{session.scenario || session.title || "Voice session"}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {session.user_id || "-"} · {formatDate(session.created_date)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingKey === `voiceSessions:${session.id}`}
                        onClick={() => void handleDeleteRecord("voiceSessions", session.id)}
                        className="rounded-xl text-muted-foreground hover:text-accent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {voiceSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No voice sessions saved yet.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Presentation Sessions</p>
                  <p className="text-xs text-muted-foreground mt-1">{presentationSessions.length} total records</p>
                </div>
                <Button variant="ghost" onClick={() => setShowPresentationSessions((prev) => !prev)} className="rounded-2xl text-muted-foreground">
                  {showPresentationSessions ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                  {showPresentationSessions ? "Collapse" : "Expand"}
                </Button>
              </div>
              {showPresentationSessions ? (
                <div className="mt-3 space-y-2">
                  {presentationSessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="rounded-xl bg-black/15 p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-foreground">{session.file_name || session.title || "Presentation session"}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {session.user_id || "-"} · {formatDate(session.created_date)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingKey === `presentationSessions:${session.id}`}
                        onClick={() => void handleDeleteRecord("presentationSessions", session.id)}
                        className="rounded-xl text-muted-foreground hover:text-accent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {presentationSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No presentation sessions saved yet.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-3xl bg-[#171717] border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle>{selectedUser?.full_name || "User detail"}</DialogTitle>
            <DialogDescription>
              {selectedUser?.email || "-"} · {selectedUser?.role || "learner"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={Mic} label="Voice Sessions" value={selectedUserVoiceSessions.length} />
            <StatCard icon={Presentation} label="Presentation Sessions" value={selectedUserPresentationSessions.length} />
            <StatCard icon={Activity} label="Events" value={selectedUserEvents.length} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Voice Sessions</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {selectedUserVoiceSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No voice sessions.</p>
                ) : (
                  selectedUserVoiceSessions.map((session) => (
                    <div key={session.id} className="rounded-xl bg-black/15 p-3">
                      <p className="text-xs text-foreground">{session.scenario || "Voice session"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDate(session.created_date)} · {session.scoring_standard || "daily"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Presentation Sessions</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {selectedUserPresentationSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No presentation sessions.</p>
                ) : (
                  selectedUserPresentationSessions.map((session) => (
                    <div key={session.id} className="rounded-xl bg-black/15 p-3">
                      <p className="text-xs text-foreground">{session.file_name || "Presentation session"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDate(session.created_date)} · {session.total_pages || 0} pages
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent User Events</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {selectedUserEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracked events.</p>
              ) : (
                selectedUserEvents.slice(0, 20).map((event) => (
                  <div key={event.id} className="rounded-xl bg-black/15 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-foreground">{event.type}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(event.timestamp)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-white/8 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
