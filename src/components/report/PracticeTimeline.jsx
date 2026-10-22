import { displayRecordDate } from '@/lib/reportDisplay';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { getScenario } from '@/lib/scenarios';

export default function PracticeTimeline({ sessions, onSelect = null }) {
  const entries = sessions.filter(s => s.id && Number.isFinite(new Date(s.created_date).getTime())).slice().sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()).slice(0, 8);
  if (!entries.length) return null;
  return <ol className="practice-timeline" aria-label="Saved practice timeline">{entries.map((session, i) => {
    const title = session.kind === 'presentation' ? session.file_name || 'Presentation rehearsal' : getScenario(session.scenario)?.title || session.scenario || 'Conversation';
    const date = displayRecordDate(session.created_date);
    const detail = `${date} · ${Math.round(Math.max(0, Number(session.duration_seconds) || 0) / 60)} min`;
    const content = <><div><strong>{title}</strong><span>{i === 0 ? 'Latest · ' : ''}{detail}</span></div><ArrowUpRight size={16} aria-hidden="true" /></>;
    return <li key={session.id || i}>{onSelect ? <button type="button" onClick={() => onSelect(session.id)} aria-label={`Open ${title}, ${date}`} title={detail}>{content}</button> : <Link title={detail} to={`${session.kind === 'presentation' ? '/presentation/history' : '/voice/history'}?session=${encodeURIComponent(session.id)}`}>{content}</Link>}</li>;
  })}</ol>;
}
