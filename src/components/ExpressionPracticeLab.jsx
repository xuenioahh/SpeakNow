import { useState, useRef } from 'react';
import { Play, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { PRACTICE_DRILLS, getDrill, describeTake } from '@/lib/expressionPractice';

function TakePlayer({ title, url, clip }) {
  const player = useRef(null);
  const [error, setError] = useState('');
  const facts = describeTake(clip);
  return <div className="practice-take">
    <p className="expression-eyebrow">{title}</p>
    <video ref={player} src={url} controls playsInline preload="metadata" aria-label={title}
      onLoadedMetadata={() => { if (player.current) player.current.currentTime = clip.start; }}
      onPlay={e => { document.querySelectorAll('video').forEach(v => { if (v !== e.currentTarget) v.pause(); });
        if (e.currentTarget.currentTime < clip.start || e.currentTarget.currentTime >= clip.end) e.currentTarget.currentTime = clip.start; }}
      onTimeUpdate={e => { if (e.currentTarget.currentTime >= clip.end) e.currentTarget.pause(); }} />
    <button className="expression-secondary" onClick={() => { player.current.currentTime = clip.start; void player.current.play().catch(() => setError('Use the video play control to replay.')); }}><Play size={15} /> Replay this moment</button>
    <blockquote>“{clip.text}”</blockquote>
    <p className="expression-small">{facts.words} transcribed words · {facts.seconds}s clip · approximate timing</p>
    {facts.movements.length > 0 && <p className="expression-small">Observed, not scored: {facts.movements.join('; ')}.</p>}
    {error && <p role="status">{error}</p>}
  </div>;
}

export function PracticeOverview({ records, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="expression-panel practice-memory">
    <p className="expression-eyebrow">YOUR PRACTICE PLAYBOOK</p><h2>Keep what works for you.</h2>
    <p>{records.length ? `${records.length} completed experiments · your own reflections, not an ability score.` : 'Your first experiment starts with one real moment. Try a change, compare, then keep one useful lesson.'}</p>
    {records.length > 3 && <button className="expression-secondary" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show recent reflections' : `Show all ${records.length} reflections`}</button>}
    {(expanded ? [...records] : records.slice(-3)).reverse().map(record => <details key={record.id}>
      <summary>{getDrill(record.drillId).skill} · {record.intention}</summary>
      <p>{record.reflection}</p><p className="expression-small">Your preference: {record.choice === 'first' ? 'original version' : record.choice === 'second' ? 'second version' : 'still exploring'}.</p>
      <p className="practice-transfer">Next conversation: {record.transfer}</p>
      <button className="expression-secondary" onClick={() => onDelete(record.id)}>Delete this reflection</button>
    </details>)}
    <p className="expression-small">Saved for this account in this browser. Videos remain in this tab only.</p>
  </section>;
}

export default function ExpressionPracticeLab({ experiment, clips, currentUrl, status, onUpdate, onRecord, onEditTranscript, onFinish, onClose, saved, onDirty }) {
  const [selection, setSelection] = useState('');
  const [choice, setChoice] = useState('');
  const [reflection, setReflection] = useState('');
  const [sameIdea, setSameIdea] = useState(false);
  const drill = getDrill(experiment.drillId);
  const afterClips = status === 'review' ? clips.filter(c => c.sessionId !== experiment.before.sessionId) : [];
  const after = afterClips.find(c => `${c.sessionId}:${c.id}` === selection) || null;
  const missing = !after?.text.trim() ? 'Add the words from your second take above before saving.'
    : !sameIdea ? 'Confirm that both moments express the same idea.'
      : !choice ? 'Choose which version serves your intention better.'
        : !reflection.trim() ? 'Write one specific thing you will keep or change next time.' : '';
  const ready = after && !missing;
  const busy = ['recording', 'requesting', 'finishing'].includes(status);
  return <section className="practice-lab" aria-label="Expression experiment">
    <div className="practice-lab-heading"><div><p className="expression-eyebrow">THE EXPRESSION LAB</p><h2>Same meaning. A new way to say it.</h2></div><button className="expression-secondary" disabled={busy} onClick={onClose}>Close experiment</button></div>
    <ol className="practice-steps" aria-label="Practice journey"><li>01 · Choose an intention</li><li>02 · Try one change</li><li>03 · Compare & keep</li></ol>
    {!afterClips.length && <div className="practice-plan">
      <div><p className="expression-small">Your starting words</p><blockquote>“{experiment.before.text}”</blockquote>
        <label>Choose one skill<select value={drill.id} disabled={busy} onChange={e => onUpdate({ drillId: e.target.value, intention: '' })}>{PRACTICE_DRILLS.map(d => <option key={d.id} value={d.id}>{d.skill} — {d.name}</option>)}</select></label>
        <label>{drill.prompt}<textarea value={experiment.intention} disabled={busy} maxLength={240} onChange={e => onUpdate({ intention: e.target.value })} placeholder="For example: I want them to understand why this plan matters." /></label>
      </div>
      <div className="practice-instructions"><p className="expression-eyebrow">{drill.skill} · {drill.time}</p><h3>{drill.name}</h3><ol>{drill.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="practice-listen">Listen for: {drill.listenFor}</p>
        <button disabled={busy || !experiment.intention.trim()} onClick={onRecord}><RotateCcw size={16} /> Record a second take</button>
        {status === 'recording' && <p role="status">Recording your second take. Use “Finish & review” in the camera panel when ready.</p>}
      </div>
    </div>}
    {afterClips.length > 0 && <>
      <p className="practice-intention">Your intention: {experiment.intention}</p><p>Listen for: {drill.listenFor}</p>
      <label>Choose the matching moment from your second take<select value={after ? selection : ''} onChange={e => { setSelection(e.target.value); setChoice(''); setReflection(''); setSameIdea(false); onDirty(); }}><option value="">Select a moment to compare</option>{afterClips.map(c => <option key={c.id} value={`${c.sessionId}:${c.id}`}>{Math.floor(c.start)}–{Math.ceil(c.end)}s · {c.text.slice(0, 65) || 'Add your words after selecting'}</option>)}</select></label>
      {after && <label>Words from your second take<textarea value={after.text} maxLength={1200} onChange={e => { onEditTranscript(after.id, e.target.value); setSameIdea(false); onDirty(); }} placeholder="Add or correct the words you said in this moment…" /></label>}
      {after && <div className="practice-comparison"><TakePlayer title="A · Your original" url={experiment.beforeUrl} clip={experiment.before} /><TakePlayer title="B · Your experiment" url={currentUrl} clip={after} /></div>}
      {after && <div className="practice-reflection"><label className="practice-checkbox"><input type="checkbox" checked={sameIdea} onChange={e => { setSameIdea(e.target.checked); onDirty(); }} />These moments express the same idea, so I can compare them fairly.</label>
        <fieldset><legend>Which version serves your intention better?</legend><div className="expression-actions">{[['first', 'Keep the original'], ['second', 'Keep the new approach'], ['unsure', 'Still exploring']].map(([value, label]) => <button key={value} aria-pressed={choice === value} className="expression-secondary" onClick={() => { setChoice(value); onDirty(); }}>{label}</button>)}</div></fieldset>
        <label>What will you keep or change next time?<textarea maxLength={600} value={reflection} onChange={e => { setReflection(e.target.value); onDirty(); }} placeholder="Name one specific thing you heard or saw, and what it did for the meaning." /></label>
        {missing && <p className="expression-small" role="status">{missing}</p>}
        <button disabled={!ready || saved} onClick={() => onFinish({ after, choice, reflection, sameIdea })}><Check size={16} /> {saved ? 'Experiment saved' : 'Save my learning'}</button>
        {saved && <p className="practice-transfer" role="status"><ArrowRight size={17} /> Take it into another conversation: {drill.transfer}</p>}
      </div>}
    </>}
  </section>;
}
