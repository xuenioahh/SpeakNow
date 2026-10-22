import PracticeTimeline from '@/components/report/PracticeTimeline';
import RadarChart from '@/components/report/RadarChart';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Check, Clock3, Edit2, Loader2, LogOut, RefreshCw, Shield, Target } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { localApi } from "@/api/localClient";
import { useAuth } from "@/lib/AuthContext";
import { subscribeActivitySync } from "@/lib/activitySync";
import { buildProfileAnalytics, metricLabel } from "@/lib/profileAnalytics";
import BottomNav from "@/components/BottomNav";
import ProfileMusic from "@/components/ProfileMusic";
import { toast } from "sonner";
import "@/profile.css";

const DEFAULT_PREFS = { weekly_goal: 3, practice_focus: "presentation" };
const shortDate = date => new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" });

export default function Profile() {
  const { isAdmin, logout } = useAuth();
  const [user, setUser] = useState(null);
  const [voice, setVoice] = useState([]);
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [track, setTrack] = useState("all");
  const [groupId, setGroupId] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [preferences, setPreferences] = useState(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInput = useRef(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [account, vs, ps] = await Promise.all([
        localApi.auth.me(),
        localApi.entities.VoiceSession.list("-created_date"),
        localApi.entities.PresentationSession.list("-created_date"),
      ]);
      if (id !== requestId.current) return;
      setUser(account);
      setVoice(Array.isArray(vs) ? vs : []);
      setPresentations(Array.isArray(ps) ? ps : []);
    } catch {
      if (id === requestId.current) setError("Your latest records could not be loaded. Please retry. Any numbers below are from the last successful refresh.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeActivitySync(() => void load());
    return () => { requestId.current++; unsubscribe(); };
  }, [load]);

  const analytics = useMemo(() => buildProfileAnalytics({ voiceSessions: voice, presentationSessions: presentations, days, track }), [voice, presentations, days, track]);
  const group = analytics.groups.find(g => g.id === groupId) || analytics.groups[0];
  const prefs = { ...DEFAULT_PREFS, ...user?.profile_preferences };
  const weeklyGoal = Number(prefs.weekly_goal) || 3;
  const remaining = Math.max(0, weeklyGoal - analytics.weekCount);
  const nextHref = prefs.practice_focus === "presentation" ? "/presentation" : "/voice";
  const suggested = analytics.advice.find(a => prefs.practice_focus === "presentation" ? a.group === "presentation" : a.group !== "presentation") || analytics.advice[0];

  const beginEdit = () => {
    setName(user?.full_name || "");
    setPreferences(prefs);
    setEditing(true);
  };
  const saveProfile = async event => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await localApi.auth.updateMe({ full_name: name.trim(), profile_preferences: preferences });
      setUser(updated);
      setEditing(false);
      toast.success("Profile and practice goal saved");
    } catch {
      toast.error("Changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const uploadAvatar = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("Choose a JPG, PNG or WebP image smaller than 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await localApi.integrations.Core.UploadFile({ file });
      const updated = await localApi.auth.updateMe({ avatar_url: file_url });
      setUser(updated);
      toast.success("Profile photo updated");
    } catch {
      toast.error("Your photo could not be saved. Please retry.");
    } finally {
      setUploading(false);
    }
  };

  if (loading && !user) return <main className="profile-dashboard" aria-busy="true"><div className="profile-panel profile-loading"><Loader2 className="animate-spin" /><p>Loading your practice records…</p></div><BottomNav /></main>;

  return <main className="profile-dashboard">
    <p role="note" className="profile-panel text-sm">This journal tracks actual sessions and duration. Unverified legacy or model-estimated scores are excluded from skill trends.</p>
    <header className="profile-heading">
      <div><p className="profile-eyebrow">YOUR PRACTICE JOURNAL</p><h1>Profile & progress</h1></div>
      <button className="profile-secondary-button" onClick={() => void load()} disabled={loading} aria-label="Refresh profile"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /><span>{loading ? "Refreshing" : "Refresh"}</span></button>
    </header>
    {error && <div role="alert" className="profile-error"><p>{error}</p><button onClick={() => void load()} disabled={loading}>Retry</button></div>}
    {!user ? <p className="profile-panel">Your profile is unavailable. Retry to load your account.</p> : <>
      <section className="profile-cover" aria-label="Your personal practice space">
        <img src="/profile-studio-v2.png" alt="A speaker rehearsing with a notebook in a sunlit studio" width="1536" height="1024" fetchPriority="high" />
        <div className="profile-cover-copy"><p className="profile-eyebrow">A LITTLE PRACTICE, OFTEN.</p><h2>Your next rehearsal<br />starts here.</h2><p>{analytics.lifetimeTotal ? `${analytics.lifetimeTotal} saved sessions. Keep a record of what works for you.` : "One conversation. One rehearsal. A place to see how you grow."}</p></div>
      </section>
      <section className="profile-panel profile-identity">
        <div className="profile-person">
          <button className="profile-avatar-button" onClick={() => avatarInput.current?.click()} disabled={uploading || saving} aria-label="Change profile photo">
            {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{user.full_name?.[0]?.toUpperCase() || "S"}</span>}
            <span className="profile-avatar-edit">{uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}</span>
          </button>
          <input ref={avatarInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />
          <div><h2>{user.full_name || "Your profile"}</h2><p>{user.email}</p><p className="profile-caption">{prefs.practice_focus === "presentation" ? "Presentation rehearsal" : "Conversation practice"} · {weeklyGoal} sessions / week</p></div>
        </div>
        {!editing && <button className="profile-secondary-button" onClick={beginEdit} disabled={uploading}><Edit2 size={16} /> Edit profile & goal</button>}
        {editing && <form onSubmit={saveProfile} className="profile-edit-form">
          <label>Display name<input required maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Weekly session goal<select value={preferences.weekly_goal} onChange={e => setPreferences(p => ({ ...p, weekly_goal: Number(e.target.value) }))}>{[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} sessions</option>)}</select></label>
          <label>Practice focus<select value={preferences.practice_focus} onChange={e => setPreferences(p => ({ ...p, practice_focus: e.target.value }))}><option value="voice">Conversation</option><option value="presentation">Presentation</option></select></label>
          <div className="profile-form-actions"><button className="profile-primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button><button type="button" className="profile-secondary-button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button></div>
        </form>}
      </section>
      <div className="profile-overview">
        <section className="profile-panel">
          <div className="profile-section-title"><h2>This week</h2><span>Last 7 days · all practice</span></div>
          <div className="profile-goal-count"><strong>{analytics.weekCount}</strong><span>/ {weeklyGoal} sessions</span><Target size={20} /></div>
          <progress aria-label="Weekly practice goal" max={weeklyGoal} value={Math.min(weeklyGoal, analytics.weekCount)} />
          <p className="profile-caption">{remaining ? `${remaining} more session${remaining === 1 ? "" : "s"} to reach your goal.` : "Weekly goal reached. Keep your next session focused."}</p>
          <div className="profile-week">{analytics.week.map(d => <div key={d.date.toISOString()}><span className={d.count ? "profile-day active" : "profile-day"} title={`${shortDate(d.date)}: ${d.count} sessions`}>{d.count || "–"}</span><span>{d.label}</span></div>)}</div>
          <p className="profile-caption">{analytics.streak} consecutive practice day{analytics.streak === 1 ? "" : "s"} · counts through today or yesterday</p>
        </section>
        <section className="profile-panel profile-next">
          <p className="profile-eyebrow">YOUR NEXT SESSION</p><h2>{suggested?.title || (prefs.practice_focus === "presentation" ? "Start with one slide" : "Start with a familiar scenario")}</h2>
          <p>{suggested?.action || (prefs.practice_focus === "presentation" ? "Upload a short PDF and rehearse its opening. Save your report to start a progress history." : "Choose a familiar situation and complete a short conversation. Save the report to receive feedback based on your practice.")}</p>
          {suggested && <p className="profile-caption">{suggested.evidence} {suggested.provisional ? "Early signal; more practice is needed for a stable pattern." : ""}</p>}
          <Link className="profile-primary-button" to={suggested?.href || nextHref}>Start practice <ArrowRight size={16} /></Link>
        </section>
      </div>
      <div className="profile-filters">
        <h2>Practice analysis</h2>
        <div><label>Period<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label>Activity<select value={track} onChange={e => setTrack(e.target.value)}><option value="all">All practice</option><option value="voice">Conversation</option><option value="presentation">Presentation</option></select></label></div>
      </div>
      <div className="profile-stats" aria-live="polite">
        <Stat label="Sessions" value={analytics.total} detail={`${analytics.voiceCount} conversations · ${analytics.presentationCount} presentations`} />
        <Stat label="Practice time" value={`${analytics.minutes} min`} detail="From saved session durations" />
        <Stat label="Average session" value={analytics.averageMinutes === null ? "—" : `${analytics.averageMinutes} min`} detail={`In the selected ${days}-day period`} />
      </div>
      {analytics.total === 0 ? <section className="profile-panel profile-empty"><Clock3 size={26} /><h2>No sessions in this period</h2><p>{analytics.lifetimeTotal ? "Choose a longer period or another activity to see your saved practice." : "Complete and save your first practice. Your recording, suggested priority and next practice will appear here."}</p><Link to={nextHref} className="profile-primary-button">Start a session <ArrowRight size={16} /></Link></section> : <>
        <section className="profile-panel">
          <div className="profile-section-title"><div><h2>Score history</h2><p className="profile-caption">Each scoring system is shown separately. These are practice estimates, not exam results.</p></div>{group && <label className="profile-chart-select">Scoring system<select value={group.id} onChange={e => setGroupId(e.target.value)}>{analytics.groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>}</div>
          {!group ? <p className="profile-empty">These sessions have no usable scored report yet. Practice time still counts.</p> : <>
            <div className="profile-score-summary"><strong>{group.average}<small> / {group.max}</small></strong><span>{group.count} scored sessions</span><span>{group.delta === null ? "At least 4 scores needed to compare trends" : `${group.delta > 0 ? "+" : ""}${group.delta} vs previous ${group.comparisonCount} sessions`}</span></div>
            {group.points.length >= 2 ? <div className="profile-chart" role="img" aria-label={`${group.label} score history. Exact values are in the table below.`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={group.points} margin={{ top: 12, right: 20, left: -20, bottom: 4 }}><CartesianGrid stroke="#343936" vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} stroke="#9baba0" tick={{ fontSize: 12 }} minTickGap={28} /><YAxis domain={[0, group.max]} stroke="#9baba0" tick={{ fontSize: 12 }} /><Tooltip labelFormatter={shortDate} formatter={value => [`${value} / ${group.max}`, "Score"]} contentStyle={{ background: "#202722", border: "1px solid #4a584d", borderRadius: 12 }} /><Line type="linear" dataKey="value" stroke="#b5d0a6" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer>
            </div> : <p className="profile-empty">One score saved. Save another report in this scoring system to see a trend.</p>}
            <details className="profile-score-table"><summary>View exact scores</summary><table><caption>{group.label} · last {days} days</caption><thead><tr><th>Date</th><th>Score</th></tr></thead><tbody>{group.points.map((point, i) => <tr key={point.id || i}><td>{shortDate(point.date)}</td><td>{point.value} / {group.max}</td></tr>)}</tbody></table></details>
          </>}
          {analytics.excludedScores > 0 && <p className="profile-caption">{analytics.excludedScores} session(s) excluded from score charts: missing or invalid scores, unknown scales, or marked fallback reports.</p>}
        </section>
        {group && <div className="profile-overview">
          <section className="profile-panel"><div className="profile-section-title"><h2>Skill breakdown</h2><span>{group.label}</span></div>{group.metrics.length > 0 && <RadarChart scores={Object.fromEntries(group.metrics.map(metric => [metric.label, metric.value]))} maxScore={group.max} history={[...voice, ...presentations].filter(session => group.points.some(point => point.id === session.id)).map(session => ({ ...session, report: { ...session.report, scores: Object.fromEntries(Object.entries(session.report?.scores || {}).map(([key, value]) => [metricLabel(key), value])) } }))} />}{group.metrics.length ? group.metrics.map(metric => <div className="profile-skill" key={metric.name}><div><span>{metric.label}</span><span>{metric.value} / {group.max}</span></div><progress aria-label={metric.label} max={group.max} value={metric.value} /><p className="profile-caption">{metric.count} scored session{metric.count === 1 ? "" : "s"}</p></div>) : <p className="profile-caption">These reports do not include individual skill scores.</p>}<p className="profile-caption">Feedback reflects the saved report. Pronunciation and body-language accuracy cannot be established from text alone.</p></section>
          <section className="profile-panel"><h2>Feedback to act on</h2>{analytics.advice.filter(a => a.group === group.id).map(a => <div key={a.group} className="profile-advice"><Check size={18} /><div><h3>{a.title}</h3><p>{a.evidence}</p><p>{a.action}</p>{a.provisional && <p className="profile-caption">Provisional: fewer than three scored sessions.</p>}<Link to={a.href}>Practise this skill <ArrowRight size={14} /></Link></div></div>)}</section>
        </div>}
        <section className="profile-panel"><div className="profile-section-title"><h2>Recent practice</h2><span>Selected period</span></div><PracticeTimeline sessions={analytics.recent} /></section>
      </>}
      {analytics.invalidDates > 0 && <p className="profile-caption">{analytics.invalidDates} record(s) with missing, invalid or future dates are not included.</p>}
      <ProfileMusic />
      <footer className="profile-footer"><span>Progress is based on your saved practice.</span><div>{isAdmin && <Link to="/admin"><Shield size={16} /> Admin</Link>}<button onClick={() => logout()}><LogOut size={16} /> Sign out</button></div></footer>
    </>}
    <BottomNav />
  </main>;
}

function Stat({ label, value, detail }) {
  return <section className="profile-panel profile-stat"><h3>{label}</h3><strong>{value}</strong><p>{detail}</p></section>;
}
