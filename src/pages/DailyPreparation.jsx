import { lazy, Suspense, useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getDailyTasks } from '@/lib/dailyTasks';
import { SCENARIOS } from '@/lib/scenarios';
import '@/scenario-studio.css';
import '@/learning.css';
const ScenarioStage = lazy(() => import('@/components/ScenarioStage'));

export default function DailyPreparation() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = SCENARIOS.find(s => s.id === params.get('scenario')) || SCENARIOS.find(s => s.id === 'cafe');
  const preview = initial;
  const [selected, setSelected] = useState(params.get('cue') && getDailyTasks(initial).some(t => t.id === params.get('cue')) ? params.get('cue') : getDailyTasks(initial)[0]?.id);
  const [sceneVisible, setSceneVisible] = useState(false);
  const [cameraPreview, setCameraPreview] = useState(false);
  const [cameraAnalysis, setCameraAnalysis] = useState(false);
  const [saveClip, setSaveClip] = useState(false);
  const choose = useCallback(id => setSelected(id), []);
  const tasks = getDailyTasks(preview);
  const start = () => navigate(`/voice/chat?${new URLSearchParams({ scenario: preview.id, cue: selected || tasks[0].id, mode: params.get('mode') === 'advanced' ? 'advanced' : 'basic', dialogMode: 'goal_oriented', camera: cameraAnalysis ? 'analysis' : cameraPreview ? 'preview' : 'off', clip: saveClip && cameraAnalysis ? 'local' : 'off' })}`);
  if (!SCENARIOS.some(scenario => scenario.id === params.get('scenario')) || params.has('cue') && !tasks.some(task => task.id === params.get('cue'))) return <main className="learning-page"><h1>Conversation unavailable</h1><Link to="/voice">Choose a scenario</Link></main>;
  return <main className="learning-page daily-guidance"><header><Link to="/voice">← Scenarios</Link><Link to="/progress">My Progress</Link></header>
    <h1>{preview.title}</h1>
    <details onToggle={event => setSceneVisible(event.currentTarget.open)}><summary>Scene preview</summary>{sceneVisible && <Suspense fallback={<div className="scenario-stage scenario-stage-loading">Preparing your scene…</div>}><ScenarioStage scenario={preview} selectedCueId={selected} onSelectCue={choose} minimal /></Suspense>}</details>

    <div className="daily-task-selector" aria-label="Choose a conversation">{tasks.map((task, index) => <button type="button" key={task.id} aria-pressed={selected === task.id} onClick={() => choose(task.id)}><span>0{index + 1}</span><strong>{task.title}</strong><small>{task.summary}</small></button>)}</div>
    <div className="daily-guidance-actions"><details className="daily-camera-choices"><summary>Camera options</summary>
      <label><input type="checkbox" checked={cameraPreview} onChange={event => { setCameraPreview(event.target.checked); if (!event.target.checked) { setCameraAnalysis(false); setSaveClip(false); } }} /> Camera preview during practice</label>
      <label><input type="checkbox" checked={cameraAnalysis} disabled={!cameraPreview} onChange={event => { setCameraAnalysis(event.target.checked); if (!event.target.checked) setSaveClip(false); }} /> Analyze visible movement on this device</label>
      <label><input type="checkbox" checked={saveClip} disabled={!cameraAnalysis} onChange={event => setSaveClip(event.target.checked)} /> Save a short video moment on this device</label>
      <small>{saveClip ? 'Saving a video moment also requests microphone access when practice starts.' : 'Microphone permission is requested when you record a reply.'} Video stays on this device and is never uploaded for analysis.</small>
    </details><button className="primary" type="button" onClick={start}>Start Conversation →</button></div>
  </main>;
}
