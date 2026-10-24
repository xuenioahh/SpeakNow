import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { learningStore } from '@/lib/learningStore';
import { apiJson } from '@/api/http';
import BottomNav from '@/components/BottomNav';
import '@/learning.css';
export default function LearningHistory() {
  const {
      user
    } = useAuth(),
    [records, setRecords] = useState([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [drafts, setDrafts] = useState([]),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const examDrafts = (await learningStore.all('drafts')).filter(d => d.id.startsWith(`exam:${user?.id || 'guest'}:`)).map(d => ({
        id: d.id,
        title: 'Continue exam practice',
        href: `/exam/practice?${new URLSearchParams({
          task: d.taskId,
          ...(d.parentId ? {
            retry: d.parentId
          } : {}),
          ...(d.focus ? {
            focus: d.focus
          } : {}),
          ...(d.question !== null && d.question !== undefined ? {
            question: d.question
          } : {})
        })}`
      }));
      const dailyDrafts = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith(`speaknow-voice-draft:${user?.id || 'guest'}:`)) continue;
        try {
          const value = JSON.parse(localStorage.getItem(key));
          if (value.href && (value.draft || value.messages?.some(m => m.role === 'user'))) dailyDrafts.push({
            id: key,
            title: `Continue ${value.title || 'conversation'}`,
            href: value.href
          });
        } catch {/* Ignore invalid browser draft, never overwrite it. */}
      }
      if (active) setDrafts([...examDrafts, ...dailyDrafts]);
      const local = (await learningStore.all('attempts')).filter(item => !item.ownerId || item.ownerId === user?.id);
      if (active) setRecords(local);
      let remote = [];
      if (user) {
        try {
          remote = await apiJson('/api/speaking-practice', {
            action: 'list'
          });
        } catch (e) {
          if (active) setError(`Cloud records could not load: ${e.message}. Device records are shown.`);
        }
      }
      const merged = new Map(local.map(a => [a.id, a]));
      for (const a of remote) merged.set(a.id, {
        ...merged.get(a.id),
        ...a,
        ownerId: user.id,
        cloudSaved: true
      });
      if (active) setRecords([...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    })().catch(e => active && setError(e.message)).finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user?.id, revision]);
  return <main className="learning-page"><header><Link to="/">← SpeakNow</Link><Link to="/voice/history">Earlier conversation records</Link></header><p className="learning-kicker">Your learning history</p><h1>Pick up where you left off.</h1><p className="learning-muted">{records.length} saved attempts · {records.filter(a => a.parentId).length} targeted retries. {user ? 'Account and device records.' : 'Device records only. Sign in for cloud history.'}</p>{error && <div className="learning-alert" role="alert">{error}<button onClick={() => setRevision(n => n + 1)}>Retry loading</button></div>}{drafts.length > 0 && <section><h2>Continue unfinished practice</h2><div className="learning-actions">{drafts.map(d => <Link className="learning-button" key={d.id} to={d.href}>{d.title} →</Link>)}</div></section>}{loading ? <p role="status">Loading…</p> : !records.length ? <div className="learning-actions"><Link className="learning-button" to="/exam">Start exam practice</Link><Link className="learning-button" to="/voice">Start a conversation</Link></div> : records.map(a => <article key={a.id} className="learning-answer"><p className="learning-kicker">{a.exam} · {a.parentId ? 'Retry' : 'First attempt'} · {new Date(a.createdAt).toLocaleString()}</p><h2><Link to={`/practice/review?id=${a.id}`}>{a.title} →</Link></h2><p>{a.feedback?.improvements?.[0]?.exercise || 'Review your answers and request feedback.'}</p><p className="learning-muted">{a.cloudSaved ? 'Account' : 'This device'} · {a.answers.length} answers</p>{a.feedback?.improvements?.[0] && <Link to={`/practice/review?id=${a.id}`}>Continue with your next focus</Link>}</article>)}<BottomNav /></main>;
}
