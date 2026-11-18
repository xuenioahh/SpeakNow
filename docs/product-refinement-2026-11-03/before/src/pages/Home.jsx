import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SCENARIOS } from '@/lib/scenarios';
import '@/learning.css';
export default function Home() {
  const [mode, setMode] = useState('basic');
  return <main className="learning-page daily-bank"><header><Link to="/">← Home</Link><Link to="/progress">My Progress</Link></header><h1>Daily Conversation</h1>
    <label className="bank-difficulty">Difficulty <select aria-label="Difficulty" value={mode} onChange={e => setMode(e.target.value)}><option value="basic">Everyday</option><option value="advanced">Challenging</option></select></label>
    <div className="daily-scenario-grid">{SCENARIOS.map(scenario => <Link key={scenario.id} className="daily-scenario" to={`/voice/prepare?${new URLSearchParams({ scenario: scenario.id, mode })}`}><h2>{scenario.title}</h2><p>{scenario.goalOriented.goal}</p></Link>)}</div>
  </main>;
}
