import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, Compass, Maximize2, Minimize2, Minus, Moon, Plus, RotateCcw, RotateCw, Sun, X } from 'lucide-react';
import { IMMERSIVE_SCENARIOS } from '@/lib/immersiveScenarios';
import { createScene } from './scene/createScene';
import '@/scenario-studio.css';

export default function ScenarioStage({ scenario }) {
  return <Stage key={scenario.id} scenario={scenario} />;
}

function Stage({ scenario }) {
  const theme = IMMERSIVE_SCENARIOS[scenario.id];
  const host = useRef(null);
  const api = useRef(null);
  const markers = useRef([]);
  const detailRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(null);
  const [visited, setVisited] = useState([]);
  const [view, setView] = useState('overview');
  const [night, setNight] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const activeCue = theme.cues.find(cue => cue.id === active);
  const select = useCallback(id => {
    setActive(id); setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    api.current?.focus(id);
  }, []);
  useEffect(() => {
    setFailed(false);
    try {
      api.current = createScene(host.current, theme, scenario.id, markers.current, select, () => { api.current = null; setFailed(true); });
    } catch (error) { console.warn('SpeakNow scene could not initialize:', error); setFailed(true); }
    return () => { api.current?.dispose(); api.current = null; };
  }, [scenario.id, theme, select, retry]);
  const reset = () => { setActive(null); setView('overview'); api.current?.focus(null); api.current?.setView('overview'); };
  const switchView = next => { setActive(null); setView(next); api.current?.focus(null); api.current?.setView(next); };
  const closeDetails = () => {
    const index = theme.cues.findIndex(c => c.id === active);
    setActive(null); api.current?.focus(null);
    if (detailRef.current?.contains(document.activeElement)) document.getElementById(`${detailsId}-cue-${index}`)?.focus();
  };
  const Icon = scenario.icon;
  return <div className={`scenario-stage immersive-stage${expanded ? ' is-expanded' : ''}`} style={/** @type {import('react').CSSProperties} */ ({ '--scene-accent': theme.accent })} aria-label={`${scenario.title} spatial preview`}>
    <div className="scene-topline">
      <div><span className="scene-live-dot" /><span>EXPLORE THE MOMENT</span></div>
      <span>{visited.length} / {theme.cues.length} discovered</span>
    </div>
    <div className="scene-title"><h3>{theme.name}</h3><p>{theme.atmosphere}</p></div>
    <div className="scene-viewport">
      <div ref={host} className="scenario-canvas" tabIndex={failed ? -1 : 0} role="group" aria-label="Interactive 3D scene. Drag to look around. Arrow keys rotate, plus and minus zoom, Home resets."
        onKeyDown={e => {
          const actions = { ArrowLeft: () => api.current?.rotate(-0.15), ArrowRight: () => api.current?.rotate(0.15), ArrowUp: () => api.current?.rotate(0, -0.12), ArrowDown: () => api.current?.rotate(0, 0.12), '+': () => api.current?.zoom(-1), '=': () => api.current?.zoom(-1), '-': () => api.current?.zoom(1), Home: reset };
          if (e.target !== e.currentTarget) return;
          if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
        }}>
        {!failed && theme.cues.map((cue, index) => <button key={cue.id} ref={el => { markers.current[index] = el; }} type="button" className={`scene-marker${active === cue.id ? ' is-active' : ''}`} aria-label={`Explore ${cue.title}`} aria-expanded={active === cue.id} aria-controls={detailsId} onPointerDown={e => e.stopPropagation()} onClick={() => select(cue.id)}><span>{visited.includes(cue.id) ? <Check size={13} /> : index + 1}</span><b>{cue.title}</b></button>)}
      </div>
      {failed && <div className="scenario-stage-fallback"><Icon size={48} /><h4>{theme.name}</h4><p>The 3D view is unavailable. You can still explore every object below.</p><button type="button" onClick={() => { setActive(null); setView('overview'); setNight(false); setRetry(n => n + 1); }}>Retry 3D view</button></div>}
      {!failed && <div className="scene-view-switch" aria-label="Camera view"><button type="button" aria-pressed={view === 'overview'} onClick={() => switchView('overview')}><Compass size={14} />Overview</button><button type="button" aria-pressed={view === 'inside'} onClick={() => switchView('inside')}><ArrowUpRight size={14} />Step inside</button></div>}
      <div className="scene-tools">
        {!failed && <><button type="button" aria-label={night ? 'Switch to daylight' : 'Switch to evening light'} aria-pressed={night} onClick={() => { setNight(!night); api.current?.lighting(!night); }}>{night ? <Moon size={17} /> : <Sun size={17} />}</button><button type="button" aria-label="Reset scene view" onClick={reset}><RotateCcw size={17} /></button></>}
        <button type="button" aria-label={expanded ? 'Reduce scene' : 'Expand scene'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      </div>
    </div>
    <div className="scenario-stage-controls"><span>{failed ? 'A moment to imagine' : 'Drag to look around · select an object'}</span>{!failed && <div><button type="button" aria-label="Rotate scene left" onClick={() => api.current?.rotate(-0.18)}><RotateCcw size={15} /></button><button type="button" aria-label="Rotate scene right" onClick={() => api.current?.rotate(0.18)}><RotateCw size={15} /></button><button type="button" aria-label="Zoom in" onClick={() => api.current?.zoom(-1)}><Plus size={15} /></button><button type="button" aria-label="Zoom out" onClick={() => api.current?.zoom(1)}><Minus size={15} /></button></div>}</div>
    <div className="scene-cue-list" aria-label="Scene objects">{theme.cues.map((cue, index) => <button type="button" id={`${detailsId}-cue-${index}`} key={cue.id} aria-expanded={active === cue.id} aria-controls={detailsId} className={active === cue.id ? 'is-active' : ''} onClick={() => active === cue.id ? closeDetails() : select(cue.id)}><span>{visited.includes(cue.id) ? <Check size={12} /> : `0${index + 1}`}</span>{cue.title}</button>)}</div>
    <div id={detailsId} ref={detailRef} className="scene-cue-detail" hidden={!activeCue} aria-live="polite">
      {activeCue && <><button type="button" className="scene-detail-close" aria-label="Close object details" onClick={closeDetails}><X size={16} /></button><span className="scene-detail-kicker">NOTICE IT. THEN SAY IT.</span><h4>{activeCue.title}</h4><p>{activeCue.detail}</p><blockquote>“{activeCue.phrase}”</blockquote><span className="scene-practice-note">A role-play cue. Try saying it in your own words.</span></>}
    </div>
  </div>;
}
