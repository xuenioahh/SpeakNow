import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SCENARIOS } from '@/lib/scenarios';
import ScenarioCard from '@/components/voice/ScenarioCard';
import BottomNav from '@/components/BottomNav';
import '@/scenario-studio.css';
import '@/learning.css';
const ScenarioStage = lazy(() => import('@/components/ScenarioStage'));
export default function Home() {
  const navigate = useNavigate(),
    [preview, setPreview] = useState(SCENARIOS.find(s => s.id === 'cafe')),
    [mode, setMode] = useState('basic'),
    [scene, setScene] = useState(false);
  return <main className="learning-page scenario-selection"><header><Link to="/">← SpeakNow</Link><Link to="/practice/history">Practice history</Link></header><p className="learning-kicker">Daily Conversation</p><h1>Where shall we talk?</h1><section className="learning-card"><h2>{preview.title}</h2><p>{preview.goalOriented.goal}</p><div className="learning-actions"><label>Difficulty <select aria-label="Difficulty" value={mode} onChange={e => setMode(e.target.value)} style={{
            background: '#282330',
            padding: 12,
            borderRadius: 12
          }}><option value="basic">Everyday</option><option value="advanced">Challenging</option></select></label><button className="primary" onClick={() => navigate(`/voice/chat?${new URLSearchParams({
          scenario: preview.id,
          mode,
          dialogMode: 'goal_oriented',
          scoring: 'daily'
        })}`)}>Start conversation →</button></div><details onToggle={e => setScene(e.currentTarget.open)}><summary>Explore the scene</summary>{scene && <Suspense fallback={<p>Preparing scene…</p>}><ScenarioStage scenario={preview} /></Suspense>}</details></section><div className="scenario-gallery" style={{
      marginTop: 24
    }}>{SCENARIOS.map(s => <ScenarioCard key={s.id} scenario={s} selected={s.id === preview.id} onClick={() => {
        setPreview(s);
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }} />)}</div><BottomNav /></main>;
}
