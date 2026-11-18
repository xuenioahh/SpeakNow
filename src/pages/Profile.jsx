import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { localApi } from '@/api/localClient';
import { useAuth } from '@/lib/AuthContext';
import BottomNav from '@/components/BottomNav';
import '@/profile.css';
export default function Profile() {
  const { user: authenticated, logout, isAdmin, checkUserAuth } = useAuth();
  const [user, setUser] = useState(authenticated), [editing, setEditing] = useState(false), [name, setName] = useState(''), [goal, setGoal] = useState(3), [focus, setFocus] = useState('voice'), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const avatar = useRef(null);
  useEffect(() => { setUser(authenticated); }, [authenticated]);
  const edit = () => { setName(user?.full_name || ''); setGoal(user?.profile_preferences?.weekly_goal || 3); setFocus(user?.profile_preferences?.practice_focus || 'voice'); setEditing(true); };
  async function save(event) {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { const updated = await localApi.auth.updateMe({ full_name: name.trim(), profile_preferences: { weekly_goal: Number(goal), practice_focus: focus } }); setUser(updated); setEditing(false); await checkUserAuth(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP smaller than 2 MB.'); return; }
    setSaving(true); setError('');
    try { const result = await localApi.integrations.Core.UploadFile({ file }); setUser(await localApi.auth.updateMe({ avatar_url: result.file_url })); await checkUserAuth(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <main className="learning-page account-page"><header><Link to="/">← Home</Link><Link to="/progress">My Progress</Link></header><h1>Your account</h1>{error && <p role="alert">{error}</p>}
    {user && <section className="account-identity"><button className="account-avatar" aria-label="Change profile photo" onClick={() => avatar.current?.click()} disabled={saving}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.full_name?.[0]?.toUpperCase() || 'S'}</button><input hidden ref={avatar} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /><div><h2>{user.full_name}</h2><p>{user.email}</p><p className="learning-muted">{user.profile_preferences?.weekly_goal || 3} sessions per week</p></div></section>}
    {editing ? <form className="account-form" onSubmit={save}><label>Display name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><label>Weekly session goal<select value={goal} onChange={e => setGoal(Number(e.target.value))}>{[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} sessions</option>)}</select></label><label>Practice focus<select value={focus} onChange={e => setFocus(e.target.value)}><option value="voice">Conversation</option><option value="presentation">Presentation</option></select></label><div className="learning-actions"><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></div></form> : <button onClick={edit} disabled={saving}>Edit profile &amp; goal</button>}
    <div className="learning-actions account-links"><Link className="learning-button" to="/progress">My Progress →</Link><Link className="learning-button" to="/membership">Membership →</Link>{isAdmin && <Link className="learning-button" to="/admin">Admin</Link>}<button onClick={() => logout()}>Sign out</button></div><BottomNav />
  </main>;
}
