import { EXPRESSION_FOCUS, EXPRESSION_LISTENERS } from '@/lib/expressionContext';
import { SCENARIOS } from '@/lib/scenarios';
import { Target, UserRound, ScanLine } from 'lucide-react';

export default function ExpressionBrief({ value, onChange, locked, onNewBrief }) {
  const scenario = SCENARIOS.find(s => s.id === value.scenarioId);
  return <section className="expression-brief" aria-label="Your speaking situation">
    <div className="expression-brief-heading"><div><p className="expression-eyebrow">01 · SET THE SCENE</p><h2>Who is listening? What should land?</h2></div><span className="expression-brief-status">{locked ? 'Context for this recording' : 'Before you record'}</span></div>
    {locked ? <>
      <div className="expression-brief-facts"><span><Target size={16} /> {scenario?.title || 'Your own situation'}</span><span><UserRound size={16} /> {EXPRESSION_LISTENERS.find(l => l.id === value.listener)?.label}</span><span><ScanLine size={16} /> {value.position === 'standing' ? 'Standing' : 'Seated'}</span></div>
      <p className="expression-intention">“{value.goal}”</p><p className="expression-small">Focus: {EXPRESSION_FOCUS.find(f => f.id === value.focus)?.label}. This context stays with both takes and your confirmed examples.</p>
      {onNewBrief && <button className="expression-secondary" onClick={onNewBrief}>Prepare a different situation</button>}
    </> : <>
      <p>Choose a real situation and one thing you want your listener to understand. We will review your words and movement against that intention.</p>
      <div className="expression-brief-fields">
        <label>Situation<select value={value.scenarioId} onChange={e => {
          const next = SCENARIOS.find(s => s.id === e.target.value);
          onChange({ ...value, scenarioId: e.target.value, goal: next?.goalOriented.goal || '', listener: ['office', 'hospital', 'university'].includes(e.target.value) ? 'professional' : next ? 'service' : 'peer' });
        }}><option value="personal">My own situation</option>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>Who is listening?<select value={value.listener} onChange={e => onChange({ ...value, listener: e.target.value })}>{EXPRESSION_LISTENERS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
        <label>One focus for this take<select value={value.focus} onChange={e => onChange({ ...value, focus: e.target.value })}>{EXPRESSION_FOCUS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label>Recording position<select value={value.position} onChange={e => onChange({ ...value, position: e.target.value })}><option value="seated">Seated</option><option value="standing">Standing</option></select></label>
      </div>
      {scenario && <div className="expression-scene-prompt"><strong>Your situation</strong><p>{scenario.goalOriented.context}</p><p className="expression-small">You: {scenario.goalOriented.userRole} · Listener: {scenario.aiRole}</p></div>}
      <label>What should your listener understand or do?<textarea maxLength={240} value={value.goal} onChange={e => onChange({ ...value, goal: e.target.value })} placeholder="For example: I want my manager to understand my plan for covering the work while I am away." /></label>
      <p className="expression-small">Speak for about 30 seconds. Keep your camera at eye level and leave room for your shoulders and hands. There is no ideal gesture to copy.</p>
    </>}
  </section>;
}
