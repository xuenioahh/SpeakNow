import CameraPreview from '@/components/presentation/CameraPreview';
import { createReviewClips } from '@/lib/expressionInsights';
import { validateVisualEvidence } from '../../shared/visualEvidence';
import { lazy, Suspense, useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2, VolumeX, Mic, Send, Camera, Info, Square } from "lucide-react";
import { localApi } from "@/api/localClient";
import { getScenario } from "@/lib/scenarios";
import { getDailyTask } from '@/lib/dailyTasks';
import { getDailyTasks } from '@/lib/dailyTasks';
import { DailyLiveMetrics } from '@/lib/dailyLiveMetrics';
import { selectLearningMoment } from '@/lib/dailyVideoMoment';
import { VoiceInteraction } from "@/lib/voice/VoiceInteraction";
import { VisionTimeline } from '@/lib/visionTimeline';
import "@/voice-room.css";
import { audioManager } from "@/lib/audioManager";
import { getDynamicSceneCue } from "@/lib/sceneAssets";
import { useAuth } from '@/lib/AuthContext';
import { conversationStream } from '@/api/conversationStream';
import { apiJson } from '@/api/http';
import { learningStore, saveAttempt } from '@/lib/learningStore';
import { cacheRecordingQuality } from '@/lib/speechAssessment';
import ConversationTranscript from '@/components/ConversationTranscript';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import '@/scenario-studio.css';
import '@/daily-immersive.css';

const VoiceOrb = lazy(() => import('@/components/spatial/VoiceOrb'));
const ScenarioStage = lazy(() => import('@/components/ScenarioStage'));

export default function VoiceChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get("scenario");
  const cueId = params.get('cue');
  const guidance = location.pathname === '/voice/prepare' && params.get('stage') !== 'conversation';
  const mode = params.get("mode") || "basic";
  const dialogMode = params.get("dialogMode") || "goal_oriented";
  const scoring = "daily";
  const { user } = useAuth();
  const parentId=params.get("retry")||null, focus=params.get("focus")||"";
  const retryPrompt=params.get('retryPrompt')||'';
  const [cameraEnabled, setCameraEnabled] = useState(['analysis', 'preview'].includes(params.get('camera')) && !guidance);
  const [cameraStatus, setCameraStatus] = useState('off');
  const [previewAllowed, setPreviewAllowed] = useState(['analysis', 'preview'].includes(params.get('camera')));
  const [analysisAllowed, setAnalysisAllowed] = useState(params.get('camera') === 'analysis');
  const [clipAllowed, setClipAllowed] = useState(params.get('clip') === 'local');
  const [selectedCue, setSelectedCue] = useState(cueId || '');
  const [cameraMoving, setCameraMoving] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [metricView, setMetricView] = useState({});
  const liveMetrics = useRef(new DailyLiveMetrics());
  const cameraActiveRef = useRef(!guidance && cameraEnabled);
  const cameraAnalysisAllowed = analysisAllowed;
  const localClipAllowed = cameraAnalysisAllowed && clipAllowed;
  const visualSamples = useRef([]);
  const vision = useRef(new VisionTimeline(null));
  const analysisContext = useRef({speaker:'none',turnId:null});
  const collectVisual = useCallback(sample => { if (!cameraActiveRef.current) return; visualSamples.current.push(sample); if(visualSamples.current.length>4800)visualSamples.current.shift(); vision.current.sample(sample,analysisContext.current);liveMetrics.current.videoSample(sample); setMetricView(liveMetrics.current.snapshot()); }, []);
  const capturedClips = useRef([]);
  const cameraControl=useRef(null),sessionStartRef=useRef(0);
  const collectClip = useCallback(clip => { if (clip.sessionStartedAt===sessionStartRef.current) capturedClips.current = [...capturedClips.current.slice(-24), clip]; }, []);
  const [saveError,setSaveError]=useState("");
  const [recordingQuality, setRecordingQuality] = useState(null);
  const attemptId=useRef(crypto.randomUUID()),endLock=useRef(false);

  const scenario = getScenario(scenarioId);
  const tasks = useMemo(() => getDailyTasks(scenario), [scenario]);
  const activeCue = selectedCue || cueId || tasks[0]?.id;
  const task = useMemo(() => getDailyTask(scenario, activeCue), [scenario, activeCue]);
  const conversationScenario = useMemo(() => task?.role ? { ...scenario, aiRole: task.role } : scenario, [scenario, task]);
  const isGoalOriented = dialogMode === "goal_oriented";
  const scenarioData = isGoalOriented ? task?.conversation : scenario?.freeTalk;


  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  sessionStartRef.current=startTime;
  const replyInputRef = useRef(null);
  const sceneCueRef = useRef('');
  const draftKey = `speaknow-voice-draft:${user?.id||"guest"}:${scenarioId}:${activeCue}:${mode}:${dialogMode}:${scoring}:${parentId||"new"}`;
  const requestCueIds = useMemo(() => new Map(), [draftKey]);
  const interaction = useMemo(() => {
    attemptId.current = crypto.randomUUID();
    let initialDraft = '';
    let initialMessages=[],initialRecordingId=null,savedSession=null;
    try { const saved=JSON.parse(localStorage.getItem(draftKey)||'null');savedSession=saved;initialDraft=saved?.draft||'';initialMessages=saved?.messages||[];if(saved?.attemptId)attemptId.current=saved.attemptId;
      initialRecordingId=saved?.pendingRecordingId||null;
      if(initialMessages.at(-1)?.role==='user'&&initialMessages.at(-1).content.trim()===initialDraft.trim()){initialDraft='';initialRecordingId=null;}
    } catch { /* Storage unavailable. */ }
    if(!initialMessages.length&&retryPrompt)initialMessages=[{id:'retry-reference',role:'ai',content:retryPrompt.slice(0,2000),source:'retry-reference'}];
    const session = new VoiceInteraction({
      audio: audioManager, aiRole: conversationScenario?.aiRole, voiceGender: scenario?.aiVoice,
      initialDraft, initialMessages, initialRecordingId,
      initialMessage: scenarioData?.firstMessage ? { id: 'opening', role: 'ai', content: scenarioData.firstMessage, source: 'scenario', aiRole: conversationScenario?.aiRole } : undefined,
      captureOptions: { onUsage: usage => void apiJson('/api/membership', { action: 'measurement', sessionId: attemptId.current, id: crypto.randomUUID(), usageType: usage.usageType, seconds: usage.seconds }).catch(() => {}) },
      saveDraft: text => { const saved=JSON.parse(localStorage.getItem(draftKey)||"{}");localStorage.setItem(draftKey,JSON.stringify({...saved,draft:text})); },
      saveRecording: async recording=>{await learningStore.put("recordings",recording);const previous=JSON.parse(localStorage.getItem(draftKey)||"{}");localStorage.setItem(draftKey,JSON.stringify({...previous,pendingRecordingId:recording.id}));void cacheRecordingQuality(recording).then(setRecordingQuality).catch(()=>{});},
      visualFor: text => getDynamicSceneCue(scenarioId, text),
      request: async (userText, { signal, history, turnId, onDelta }) => {
        // Retries retain the scene context of the original turn.
        if (!requestCueIds.has(turnId)) requestCueIds.set(turnId, sceneCueRef.current);
        await apiJson('/api/membership', { action: 'start', id: attemptId.current, kind: 'daily' });
        return conversationStream({ sessionId: attemptId.current, turnId, scenario: conversationScenario, scenarioData, history, userText, mode, scoring, isGoalOriented, sceneCueId: task?.id || requestCueIds.get(turnId) }, { signal, onDelta });
      },
    });
    session.sessionId=attemptId.current;session.startedAt=savedSession?.startedAt||Date.now();session.savedAnalysis=savedSession;
    if(savedSession?.timings)session.update({timings:savedSession.timings});
    return session;
  }, [draftKey, scenario, conversationScenario, scenarioData, scenarioId, mode, scoring, isGoalOriented, requestCueIds, focus, task,retryPrompt]);
  const state = useSyncExternalStore(interaction.subscribe, interaction.getSnapshot, interaction.getSnapshot);
  const messages = state.messages;
  analysisContext.current={speaker:state.status==='listening'?'user':state.status==='speaking'?'ai':'none',turnId:state.status==='listening'?`turn-${interaction.sequence+1}`:state.status==='speaking'?interaction.lastTurn?.id||null:null};
  useEffect(()=>{
    setStartTime(interaction.startedAt);vision.current=new VisionTimeline(interaction.sessionId);
    const saved=interaction.savedAnalysis;
    if(saved?.visionTimeline){vision.current.events=saved.visionTimeline.events||[];vision.current.frames=saved.visionTimeline.frames||0;vision.current.valid=saved.visionTimeline.validSamples||{face:0,body:0,hands:0};}
    if(saved?.liveMetrics){liveMetrics.current.metrics=saved.liveMetrics.metrics||{};liveMetrics.current.turns=(saved.liveMetrics.timeline||[]).filter(item=>item.kind==='turn');liveMetrics.current.pauseEvents=(saved.liveMetrics.timeline||[]).filter(item=>item.kind==='pause');}
  },[interaction]);

  const fallbackNotice = state.error;

  const exchanges = messages.filter(message => message.role === 'user').length;
  const latestPartnerMessage = [...messages].reverse().find(message => message.role === 'ai');
  const recording = ['requesting_permission', 'starting', 'listening'].includes(state.status) || state.recordingSession;
  const busy = ['stopping', 'finalizing', 'submitting', 'processing'].includes(state.status);
  useEffect(() => { if (!guidance && state.error && !state.retryable) replyInputRef.current?.focus(); }, [guidance, state.error, state.retryable]);
  useEffect(() => { sceneCueRef.current = ''; }, [draftKey]);
  const selectCue = useCallback(id => { if (id === activeCue) return; setCameraMoving(true); setSelectedCue(id); }, [activeCue]);
  const onCameraTransition = useCallback(moving => setCameraMoving(moving), []);
  useEffect(() => { if (guidance) { liveMetrics.current = new DailyLiveMetrics(); visualSamples.current = []; capturedClips.current = []; setMetricView({}); } }, [activeCue, guidance]);
  async function beginVoice() {
    try { await apiJson('/api/membership', { action: 'start', id: attemptId.current, kind: 'daily' }); setSaveError(''); await interaction.startContinuous(); } catch (error) { setSaveError(error.message); }
  }
  async function startConversation() {
    try { await apiJson('/api/membership', { action: 'start', id: attemptId.current, kind: 'daily' }); } catch (error) { setSaveError(error.message); return; }
    const next = new URLSearchParams(location.search);
    next.set('cue', activeCue); next.set('stage', 'conversation'); next.set('dialogMode', dialogMode);
    next.set('camera', analysisAllowed ? 'analysis' : previewAllowed ? 'preview' : 'off');
    next.set('clip', clipAllowed && analysisAllowed ? 'local' : 'off');
    if(!interaction.savedAnalysis)interaction.startedAt=Date.now();
    setStartTime(interaction.startedAt); setElapsed(0); cameraActiveRef.current = previewAllowed; setCameraEnabled(previewAllowed);
    navigate(`${location.pathname}?${next}`, { replace: true });
    void interaction.startContinuous();
  }

  useEffect(() => {
    cameraActiveRef.current = cameraEnabled && !guidance;
    if (!cameraActiveRef.current) { vision.current.flush();liveMetrics.current.cameraOff(); setMetricView(liveMetrics.current.snapshot()); }
  }, [cameraEnabled, guidance]);
  useEffect(() => {
    if (guidance) return;
    const timer = window.setInterval(() => {
      const time = (Date.now() - startTime) / 1000;
      const meter = interaction.energyRef.current;
      liveMetrics.current.audioSample(time, meter?.readRms?.(), state.status === 'listening', [state.finalText, state.interimText].filter(Boolean).join(' '),{...analysisContext.current,sessionId:attemptId.current});
      if (state.status === 'listening' && meter) setMetricView(liveMetrics.current.snapshot());
    }, 160);
    return () => window.clearInterval(timer);
  }, [guidance, interaction, startTime, state.status, state.finalText, state.interimText]);
  const seenTurns = useRef(new Set()), seenFeedback = useRef(new Set());
  useEffect(()=>{seenTurns.current=new Set(interaction.savedAnalysis?interaction.getSnapshot().messages.filter(message=>message.role==='user').map(message=>message.id):[]);seenFeedback.current=new Set();},[interaction]);
  useEffect(() => {
    if (guidance) return;
    const time = (Date.now() - startTime) / 1000;
    for (const message of messages) {
      if (message.role !== 'user') continue;
      if (!seenTurns.current.has(message.id)) { liveMetrics.current.turn(message.content, time); seenTurns.current.add(message.id); }
      if (message.feedback && !seenFeedback.current.has(message.id)) { liveMetrics.current.feedback(message.feedback, time); seenFeedback.current.add(message.id); }
    }
    setMetricView(liveMetrics.current.snapshot());
  }, [messages, guidance, startTime]);

  useEffect(() => {
    if (!scenario) navigate('/voice');
  }, [navigate, scenario]);
  useEffect(() => () => interaction.dispose(), [interaction]);
  useEffect(() => {
    if (guidance || !scenario || !scenarioData || cameraMoving) return;
    interaction.activate();
    if (user) void localApi.integrations.Core.TrackActivity({ activity_type: 'voice_practice_started', scenario: scenarioId, mode, dialog_mode: dialogMode, scoring_standard: scoring }).catch(error => console.error('Failed to track voice practice start:', error));
  }, [interaction, scenario, scenarioData, scenarioId, mode, dialogMode, scoring, user, guidance, cameraMoving]);
  useEffect(() => {
    if (guidance) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startTime, guidance]);

  useEffect(() => {
    if (guidance) return;
    return interaction.subscribe(() => {
    const current=interaction.getSnapshot();
    try { localStorage.setItem(draftKey,JSON.stringify({...JSON.parse(localStorage.getItem(draftKey)||'{}'),startedAt:startTime,timings:current.timings,pendingRecordingId:current.typedText||current.finalText||current.interimText?JSON.parse(localStorage.getItem(draftKey)||"{}").pendingRecordingId:null,attemptId:attemptId.current,href:location.pathname+location.search,title:scenario?.title,ownerId:user?.id||null,updatedAt:new Date().toISOString(),messages:current.messages,draft:current.typedText||[current.finalText,current.interimText].filter(Boolean).join(' ')})); }
    catch { setSaveError('Draft storage is unavailable. Keep this page open until you save the practice.'); }
    });
  },[interaction,draftKey,guidance,location.pathname,location.search,scenario?.title,user?.id,startTime]);

  useEffect(()=>{
    if(guidance)return;
    const persist=()=>{
      if(interaction.ended)return;
      const current=interaction.getSnapshot();
      try{const value={...JSON.parse(localStorage.getItem(draftKey)||'{}'),id:draftKey,attemptId:attemptId.current,startedAt:startTime,href:location.pathname+location.search,title:scenario?.title,messages:current.messages,timings:current.timings,visionTimeline:vision.current.summary(),liveMetrics:liveMetrics.current.summary()};localStorage.setItem(draftKey,JSON.stringify(value));void learningStore.put('drafts',value).catch(()=>setSaveError('Session storage failed. Keep this page open and retry saving.'));}catch{setSaveError('Session storage failed. Keep this page open and retry saving.');}
    };
    const timer=setInterval(persist,5000);window.addEventListener('pagehide',persist);
    return()=>{persist();clearInterval(timer);window.removeEventListener('pagehide',persist);};
  },[guidance,interaction,draftKey,startTime,location.pathname,location.search,scenario?.title]);

  const handleEnd = async () => {
    if(endLock.current)return;endLock.current=true;setSaveError('');
    vision.current.flush();
    const completion=interaction.complete();
    const cameraFlush=cameraControl.current?.stop();
    cameraActiveRef.current = false;
    try {
      await cameraFlush;setCameraEnabled(false);
      const finished=await completion;if(!finished||interaction.disposed)return;
      const endedMessages=[...finished.messages];
      const unsent=finished.typedText||[finished.finalText,finished.interimText].filter(Boolean).join(' ');
      const pendingRecordingId = await interaction.audioTake?.stop();
      if((unsent.trim() || pendingRecordingId) && (!unsent.trim() || endedMessages.at(-1)?.content!==unsent.trim()) && !endedMessages.some(message => message.recordingId && message.recordingId === pendingRecordingId)){endedMessages.push({role:'user',turnId:`turn-${interaction.sequence+1}`,sessionId:attemptId.current,startedAt:interaction.captureStartedAt,endedAt:Date.now(),content:unsent.trim(),rawTranscript:finished.finalText||null,recordingId:pendingRecordingId});if(unsent.trim())liveMetrics.current.turn(unsent,(Date.now()-startTime)/1000);}
      const answers=endedMessages.flatMap((message,index)=>message.role==='user'?[{turnId:message.turnId,questionIndex:index,text:message.content,rawTranscript:message.rawTranscript,prompt:endedMessages[index-1]?.content||scenarioData?.goal||scenario.title,recordingId:message.recordingId||null,inputMode:message.recordingId?'voice':'text',durationSeconds:0,startSeconds:message.startedAt?Math.max(0,(message.startedAt-startTime)/1000):null}]:[]);
      if(!answers.length){setSaveError('Say or type an answer before finishing.');interaction.ended=false;interaction.completing=false;interaction.update({status:'idle'});return;}
      for (const answer of answers) { if (answer.recordingId) { const clip = await learningStore.get('recordings',answer.recordingId); answer.durationSeconds = clip?.durationSeconds || 0; answer.startSeconds = clip?.startedAt ? Math.max(0,(clip.startedAt-startTime)/1000) : null; } }
      const reviewWindows = cameraAnalysisAllowed ? createReviewClips(visualSamples.current,answers.filter(a=>Number.isFinite(a.startSeconds)).map(a=>({start:a.startSeconds,end:a.startSeconds+a.durationSeconds,text:a.text})),(Date.now()-startTime)/1000) : [];
      const chosen = localClipAllowed ? selectLearningMoment(capturedClips.current, reviewWindows, answers) : null;
      let videoClip = null;
      if (chosen) {
        await learningStore.put('recordings', { id: chosen.clip.id, blob: chosen.clip.blob, durationSeconds: chosen.clip.end - chosen.clip.start, startedAt: startTime + chosen.clip.start * 1000, kind: 'local-video' });
        const faceX = chosen.window.observations?.faceX;
        const left = faceX < .2;
        const note = chosen.reason === 'framing' ? {
          observation: `During this reply, your face was near the ${left ? 'left' : 'right'} edge of the camera frame.`,
          why: 'Your expression is easier to see when your face remains within the frame.',
          tryThis: 'Adjust the camera or your seat so your face stays comfortably within the frame.'
        } : chosen.reason === 'hand movement' ? {
          observation: 'Visible wrist position changed during this reply.',
          why: 'The recording can help you check whether that movement supported what you were saying.',
          tryThis: 'Replay this moment and decide whether your hand movement matches the point you wanted to make.'
        } : {
          observation: 'Your head direction changed during this reply.',
          why: 'The recording can help you review where you faced while explaining your point.',
          tryThis: 'Replay this moment and check whether the camera angle works for your next conversation.'
        };
        videoClip = { id: chosen.clip.id, start: chosen.clip.start, end: chosen.clip.end, startTime: chosen.clip.start, endTime: chosen.clip.end,
          transcriptSegment: chosen.window.text, relatedMetrics: chosen.window.metrics, localOnly: true,
          ...note };
      }
      await saveAttempt({id:attemptId.current,track:'daily',taskId:`daily-${scenarioId}`,title:`${scenario.title} · ${task?.title || 'Conversation'}`,parentId,focus,answers,turns:endedMessages,visionTimeline:vision.current.summary(),voiceTimings:finished.timings,visualEvidence:cameraAnalysisAllowed ? validateVisualEvidence({source:'device-mediapipe',windows:reviewWindows}) : null,videoClip,liveMetrics:liveMetrics.current.summary(),context:{scenario:scenarioId,cue:task?.id,mode,dialogMode},ownerId:user?.id||null,createdAt:new Date(startTime).toISOString()});
      await apiJson('/api/membership', { action: 'finish', id: attemptId.current }).catch(() => {});
      localStorage.removeItem(draftKey);await learningStore.remove('drafts',draftKey);navigate(`/practice/review?id=${attemptId.current}`);
    } catch(error){setSaveError(error.message);}
    finally{endLock.current=false;}
  };

  const handleExit = () => {
    interaction.dispose();
    navigate("/voice");
  };

  if (!scenario) return null;
  if (!task) return <main className="learning-page"><h1>Conversation unavailable</h1><button onClick={() => navigate(`/voice/prepare?scenario=${scenario.id}`)}>Choose a conversation</button></main>;

  const statusText = ({ idle: state.continuous ? 'Your turn' : 'Paused', requesting_permission: 'Allow microphone access', starting: 'Connecting microphone…', listening: 'Listening to you', stopping: 'Saving your reply…', finalizing: 'Finishing recognition…', submitting: 'Sending…', processing: `${task.npcName} is thinking…`, speaking: `${task.npcName} is speaking`, completed: 'Conversation saved', error: 'Connection needs attention' })[state.status] || 'Ready';
  const isSpeaking = state.status === 'speaking';
  const replyText = state.typedText || (!recording ? [state.finalText, state.interimText].filter(Boolean).join(' ') : '');
  function toggleVoice() {
    const enabled = !voiceEnabled; setVoiceEnabled(enabled); interaction.configure({ autoPlay: enabled });
    if (!enabled && isSpeaking && state.continuous) void interaction.startRecording();
  }
  return <div className={`speaking-room daily-immersive${guidance ? ' is-guidance' : ' is-conversation'}`} data-interaction-state={state.status} data-session-state={endLock.current ? 'CONVERSATION_ENDING' : cameraMoving ? 'CAMERA_TRANSITION' : guidance ? 'CONVERSATION_READY' : 'CONVERSATION_ACTIVE'}>
    <div className="daily-world" aria-label="Continuous 3D conversation scene">
      <Suspense fallback={<div className="scenario-stage scenario-stage-loading">Preparing your scene…</div>}><ScenarioStage scenario={scenario} selectedCueId={activeCue} onSelectCue={guidance ? selectCue : null} minimal onCameraTransition={onCameraTransition} subtitleMode="hidden" conversation={guidance ? null : { role: `${task.npcName} · ${task.role}`, status: state.status, energyRef: audioManager['outputEnergyRef'], onAudioFrame: frame => audioManager['setSpatialFrame']?.(frame), reply: state.streamingText || latestPartnerMessage?.content || '', isLocal: latestPartnerMessage?.source === 'fallback' }} /></Suspense>
    </div>
    <header className="daily-overlay-header"><button type="button" aria-label="Exit conversation" onClick={handleExit}><ArrowLeft size={16} /><span>Exit</span></button><div><h1>{task.title}</h1><span>{scenario.title} · {guidance ? task.npcName : `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`}</span></div></header>
    {guidance ? <section className="daily-guidance-overlay" aria-label="Choose a conversation">
      <div className="daily-task-selector"><label htmlFor="conversation-choice">Conversation</label><select id="conversation-choice" value={activeCue} onChange={event => selectCue(event.target.value)}>{tasks.map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}</select><p>{task.summary}</p></div>
      <p className="guidance-voice-note">{task.npcName} starts the conversation. Listen, then reply.</p>
      <button type="button" className="guidance-camera" onClick={() => setCameraSettingsOpen(true)}><Camera size={16} />Camera settings</button>
      <button type="button" className="primary" disabled={cameraMoving} onClick={startConversation}>{cameraMoving ? 'Moving to conversation…' : 'Start Conversation'}</button>
    </section> : <>
      <aside className="daily-conversation-panel" aria-label="Conversation panel">
        <header className="conversation-panel-header"><div><h2>{task.npcName} <span>· {task.role}</span></h2><p role="status">{statusText}</p></div><div className="conversation-toolbar"><button type="button" aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'} aria-pressed={voiceEnabled} onClick={toggleVoice} title={voiceEnabled ? 'Voice on' : 'Voice off'}>{voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button type="button" aria-label="Camera settings" onClick={() => setCameraSettingsOpen(true)} title="Camera settings"><Camera size={18} /></button><button type="button" aria-label="Practice details" onClick={() => setDetailsOpen(true)} title="Practice details"><Info size={18} /></button></div></header>
        <ConversationTranscript messages={messages} streamingText={state.streamingText} finalText={state.finalText} interimText={state.interimText} partnerName={task.npcName} onReplay={id => void interaction.playMessage(id)} activePlaybackId={state.activePlaybackId} replayDisabled={busy || recording || cameraMoving} />
        <div className="daily-immersive-controls">
          {(saveError || fallbackNotice) && <div className="conversation-error" role="alert"><p>{saveError || fallbackNotice}</p>{state.retryable && <button type="button" onClick={() => interaction.retryRequest()} disabled={busy}>Retry reply</button>}</div>}
          {state.notice && <p className="conversation-notice" role="status">{state.notice}</p>}
          {state.status === 'processing' && <button type="button" className="conversation-cancel" onClick={() => interaction.cancelRequest()}>Cancel request · keep my reply</button>}
          <div className="daily-reply-row"><button type="button" className="composer-mic" aria-label={recording ? 'Stop recording and send' : 'Record one reply'} title={recording ? 'Send recording' : 'Record one reply'} disabled={busy || cameraMoving} onClick={() => recording ? void interaction.stopRecording() : void interaction.startRecording()}>{recording ? <Square size={16} /> : <Mic size={18} />}</button><input ref={replyInputRef} aria-label="Your reply" placeholder={recording ? 'Listening…' : 'Type a reply'} value={replyText} onChange={event => interaction.setTypedText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !busy && !recording && !cameraMoving && replyText.trim()) { event.preventDefault(); void interaction.send({ text: replyText }); } }} disabled={busy || recording || cameraMoving} /><button type="button" className="composer-send" aria-label="Send reply" disabled={busy || recording || cameraMoving || !replyText.trim()} onClick={() => void interaction.send({ text: replyText })}><Send size={17} /></button></div>
          <div className="daily-main-controls"><button type="button" className="daily-primary-action" aria-label={state.continuous ? 'Pause conversation' : exchanges ? 'Resume voice conversation' : 'Start voice conversation'} aria-pressed={state.continuous} onClick={() => { if(state.continuous) void interaction.pauseContinuous(); else void beginVoice(); }} disabled={cameraMoving || (!state.continuous && Boolean(replyText.trim()))}><Mic size={16} />{state.continuous ? 'Pause' : exchanges ? 'Resume' : 'Start talking'}</button><div className="conversation-voice-activity" aria-label="Voice activity"><Suspense fallback={null}><VoiceOrb state={state.status} energyRef={isSpeaking ? audioManager['outputEnergyRef'] : interaction.energyRef} /></Suspense></div><button type="button" className="daily-finish-action" aria-label={saveError && interaction.ended ? 'Retry save' : 'Finish & review'} disabled={['stopping', 'finalizing'].includes(state.status)} onClick={handleEnd}>{saveError && interaction.ended ? 'Retry save' : 'Finish & review'}</button></div>
        </div>
      </aside>
      {cameraEnabled && <CameraPreview onSample={cameraAnalysisAllowed ? collectVisual : null} onClip={localClipAllowed ? collectClip : null} onCameraStatus={setCameraStatus} startedAt={startTime} captureRef={cameraControl} />}
    </>}
    <Dialog open={cameraSettingsOpen} onOpenChange={setCameraSettingsOpen}><DialogContent className="conversation-settings-dialog"><DialogHeader><DialogTitle>Camera</DialogTitle><DialogDescription>Optional. Voice practice works with the camera off.</DialogDescription></DialogHeader><div className="camera-setting-rows"><label><span>Camera preview</span><input type="checkbox" checked={guidance ? previewAllowed : cameraEnabled} onChange={event => { const enabled = event.target.checked; setPreviewAllowed(enabled); if(!guidance) setCameraEnabled(enabled); if(!enabled){cameraActiveRef.current=false;setAnalysisAllowed(false);setClipAllowed(false);} }} /></label><label><span>Review visible movement<small>Analyzed on this device</small></span><input type="checkbox" checked={analysisAllowed} disabled={!(guidance ? previewAllowed : cameraEnabled)} onChange={event=>{setAnalysisAllowed(event.target.checked);if(!event.target.checked)setClipAllowed(false);}} /></label><label><span>Save a video moment<small>Kept on this device</small></span><input type="checkbox" checked={clipAllowed} disabled={!analysisAllowed} onChange={event=>setClipAllowed(event.target.checked)} /></label></div>{cameraEnabled && !guidance && <p role="status">{cameraStatus === 'active' ? 'Camera is on' : cameraStatus === 'unavailable' ? 'Camera unavailable. Check permission and try again.' : 'Starting camera…'}</p>}</DialogContent></Dialog>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="conversation-settings-dialog"><DialogHeader><DialogTitle>Practice details</DialogTitle><DialogDescription>Observations from this conversation. Full feedback is available after you finish.</DialogDescription></DialogHeader>{recordingQuality && <p className="recording-check-note">{recordingQuality.issues.length ? recordingQuality.issues.map(issue=>issue.message).join(' ') : 'The latest recording passed level checks.'} · {recordingQuality.durationSeconds.toFixed(1)} s</p>}<LivePerformance metrics={metricView} /></DialogContent></Dialog>
  </div>;
}

function LivePerformance({ metrics }) {
  /** @type {[string, [string, string][]][]} */
  const groups = [
    ['Speech', [['pace', 'Pace'], ['pauses', 'Pauses'], ['fluency', 'Speech continuity'], ['volume', 'Volume'], ['fillers', 'Filler words'], ['pronunciation', 'Pronunciation'], ['intonation', 'Intonation'], ['clarity', 'Speech clarity']]],
    ['Camera', [['headOrientation', 'Head orientation'], ['handMovement', 'Hand movement'], ['posture', 'Visible posture'], ['cameraEngagement', 'Camera direction'], ['framing', 'Framing'], ['gestureTypes', 'Gesture types'], ['gestureTiming', 'Gesture timing'], ['facialExpression', 'Facial expression']]],
    ['Communication', [['relevance', 'Relevance'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary'], ['coherence', 'Coherence'], ['interaction', 'Interaction']]],
  ];
  return <div className="daily-live-groups">{!Object.keys(metrics).length && <p className="daily-metric-empty">No measurements yet.</p>}{groups.map(([title, entries]) => {
    const available = entries.filter(([key]) => metrics[key]);
    return available.length > 0 && <section key={title}><h2>{title}</h2>{available.map(([key, label]) => <div className="daily-live-row" key={key} title={`${metrics[key].source} · ${metrics[key].samples} samples · ${metrics[key].reliability}`}><span>{label}</span><strong>{metrics[key].value}</strong></div>)}</section>;
  })}</div>;
}
