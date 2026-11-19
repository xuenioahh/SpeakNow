import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { localApi } from '@/api/localClient';
import BottomNav from '@/components/BottomNav';
import { useLearningRecords } from '@/hooks/useLearningRecords';
import '@/learning.css';
const duration = value => value == null ? 'Time unavailable' : value >= 60 ? `${Math.floor(value / 60)}m ${Math.round(value % 60)}s` : `${Math.round(value)}s`;
export default function LearningDashboard() {
  const [params, setParams] = useSearchParams();
  const { records, drafts, loading, error, detailedInsights, insights, refresh } = useLearningRecords();
  const tab = ['overview', 'history', 'insights'].includes(params.get('tab')) ? params.get('tab') : 'overview';
  const filter = params.get('exam') || 'all', query = params.get('q') || '';
  const selected = records.find(record => record.id === params.get('record'));
  const shown = records.filter(record => (filter === 'all' || record.exam === filter) && (!query || `${record.title} ${record.exam}`.toLowerCase().includes(query.toLowerCase())));
  const change = (key, value) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  const rows = values => values.map(record => <article className="progress-record" key={record.id}><div><p className="learning-kicker">{record.exam.toUpperCase()} · {record.kind === 'learning' && record.attempt.type === 'ielts-mock' ? record.attempt.part ? `Part ${record.attempt.part} retry` : 'Full mock' : record.parentId ? 'Retry' : 'Practice'}</p><h3><Link to={record.href}>{record.title}</Link></h3><p className="learning-muted">{Number.isFinite(Date.parse(record.date)) ? new Date(record.date).toLocaleString() : 'Date unavailable'} · {duration(record.seconds)} · {record.completed ? 'Completed' : 'Partial'} · {record.source}</p></div><Link className="learning-button" to={record.href}>View feedback</Link></article>);
  return <main className="learning-page progress-page"><header><Link to="/">← Home</Link><nav><Link to="/membership">Membership</Link> <button onClick={refresh} disabled={loading}>Refresh</button></nav></header>
    <h1>My Progress</h1><p className="learning-muted">Your practice, feedback and next step in one place.</p>
    <nav className="progress-tabs" aria-label="My Progress views">{[['overview', 'Overview'], ['history', 'Practice History'], ['insights', 'Performance & Insights']].map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => change('tab', id)}>{label}</button>)}</nav>
    {loading && <p role="status">Loading practice records…</p>}{error && <p role="alert">{error} <button onClick={refresh}>Retry</button></p>}
    {tab === 'overview' && <><div className="progress-stats">{[['Total practice sessions', insights.total], ['Recorded speaking time', insights.seconds == null ? '—' : duration(insights.seconds)], ['TOEFL practice', insights.counts.toefl], ['IELTS practice', insights.counts.ielts], ['Daily Conversation', insights.counts.daily]].map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
      {drafts.length > 0 && <section><h2>Continue unfinished practice</h2><div className="draft-links">{drafts.map(draft => <Link key={draft.id} to={draft.href}>{draft.title} →</Link>)}</div></section>}
      <section><h2>Recent progress</h2>{insights.total ? <><div className="progress-week" aria-label="Practice sessions in the last seven days">{insights.week.map((day, i) => <div key={i}><span className="week-bar-track" aria-hidden="true"><i style={{height: `${100 * day.count / Math.max(1, ...insights.week.map(item => item.count))}%`}} /></span><strong>{day.count}</strong><span>{day.label}</span></div>)}</div>{rows(insights.recent)}</> : <p>No saved practice yet. Complete a session to start your journal.</p>}</section>
      <div className="learning-actions"><Link className="learning-button primary" to="/exam">Exam practice</Link><Link className="learning-button" to="/voice">Daily Conversation</Link></div></>}
    {tab === 'history' && <section><div className="progress-filters"><label>Practice type<select aria-label="Practice type" value={filter} onChange={e => change('exam', e.target.value)}>{[['all', 'All practice'], ['toefl', 'TOEFL'], ['ielts', 'IELTS'], ['daily', 'Daily Conversation'], ['presentation', 'Presentation']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Search history<input type="search" value={query} onChange={e => change('q', e.target.value)} /></label></div>
      {selected && selected.legacy && <LegacyRecord record={selected} close={() => change('record', '')} refresh={refresh} />}
      {rows(shown)}{!loading && !shown.length && <p>No matching practice records.</p>}</section>}
    {tab === 'insights' && <section><h2>Your next practice</h2>{insights.next ? <article className="progress-next"><p>{insights.next.exercise}</p><details><summary>Why this is suggested</summary><blockquote>{insights.next.quote}</blockquote><p>{insights.next.reason}</p></details><Link className="learning-button primary" to={insights.next.href}>Review and practise again</Link></article> : <p>Save practice with evidence-linked feedback to receive a specific next step.</p>}
      <h2>Language focus</h2>{insights.focuses.length ? <ul>{insights.focuses.map(([label, count]) => <li key={label}>{label} · {count} feedback {count === 1 ? 'observation' : 'observations'}</li>)}</ul> : <p>No verified language patterns yet.</p>}
      <p className="learning-muted">Patterns reflect saved feedback on your actual words. They are not a measured skill score.</p>
      <h2>Same-task retries</h2>{detailedInsights ? insights.pairs.length ? insights.pairs.map(pair => <article className="progress-comparison" key={pair.id}><h3>{pair.title}</h3><p>{pair.answers.filter(answer => answer.changed).length} of {pair.answers.length} matched answers changed.</p><details><summary>Compare transcripts</summary>{pair.answers.map(answer => <div key={answer.questionIndex}><p><strong>Before:</strong> {answer.before}</p><p><strong>After:</strong> {answer.after}</p></div>)}</details><Link to={pair.href}>Open retry and feedback →</Link></article>) : <p>Retry the same task to compare your actual answers here.</p> : <p>Extended comparisons are a VIP feature. <Link to="/membership">View membership information</Link></p>}
    </section>}
    <BottomNav />
  </main>;
}
function LegacyRecord({ record, close, refresh }) {
  const [error, setError] = useState(''), [deleting, setDeleting] = useState(false);
  async function remove() {
    if (deleting || !window.confirm('Permanently delete this saved practice?')) return;
    setDeleting(true); setError('');
    try { await localApi.entities[record.kind === 'presentation' ? 'PresentationSession' : 'VoiceSession'].delete(record.id); close(); refresh(); } catch (error) { setError(error.message); } finally { setDeleting(false); }
  }
  const report = record.legacy.report || {};
  const summary = report.summary || report.overall_feedback || report.executive_summary;
  return <article className="legacy-record"><header><h2>{record.title}</h2><button onClick={close}>Close details</button></header><p>{typeof summary === 'string' ? summary : 'Saved legacy practice report'}</p>
    {Array.isArray(record.legacy.messages) && <details><summary>Conversation transcript</summary>{record.legacy.messages.map((turn, index) => <p key={index}><strong>{turn.role === 'user' ? 'You' : 'Partner'}:</strong> {turn.content}</p>)}</details>}
    {['strengths', 'improvements', 'suggestions', 'conversation_review', 'grammar_analysis'].map(key => Array.isArray(report[key]) && report[key].length > 0 && <details key={key}><summary>{key.replace(/_/g, ' ')}</summary>{report[key].map((item, i) => <p key={i}>{typeof item === 'string' ? item : [item.error, item.correction, item.reason, item.suggestion, item.feedback].filter(Boolean).join(' · ')}</p>)}</details>)}
    <details><summary>Complete saved feedback</summary>{Object.entries(report).filter(([key]) => !/^(source|model|provider|usage|impact|measurement_basis|id|createdAt|created_date)$/.test(key)).map(([key, value]) => <section key={key}><h3>{key.replace(/_/g, ' ')}</h3><SavedFeedback value={value} /></section>)}</details>
    {error && <p role="alert">{error}</p>}<button disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Delete saved practice'}</button>
    <p className="learning-muted">This is the original saved report. Legacy numeric estimates are excluded from learning trends.</p><Link className="learning-button" to={record.exam === 'presentation' ? '/presentation' : '/voice'}>Practise again</Link></article>;
}

function SavedFeedback({ value }) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return <p>{String(value)}</p>;
  if (Array.isArray(value)) return <ul>{value.map((item, index) => <li key={index}><SavedFeedback value={item} /></li>)}</ul>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd><SavedFeedback value={item} /></dd></div>)}</dl>;
  return null;
}
