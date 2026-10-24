import CameraPreview from '@/components/presentation/CameraPreview';
import { createReviewClips } from '@/lib/expressionInsights';
import { validateVisualEvidence } from '../../shared/visualEvidence';
import { lazy, Suspense, useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2 } from "lucide-react";
import { localApi } from "@/api/localClient";
import { getScenario } from "@/lib/scenarios";
import { VoiceInteraction } from "@/lib/voice/VoiceInteraction";
import { resolveVoiceOrbState } from "@/lib/voiceOrbState";
import "@/voice-room.css";
import { audioManager } from "@/lib/audioManager";
import { getDynamicSceneCue } from "@/lib/sceneAssets";
import { useAuth } from '@/lib/AuthContext';
import { apiJson } from '@/api/http';
import { learningStore, saveAttempt } from '@/lib/learningStore';
import ChatMessage from "@/components/voice/ChatMessage";
import RecordingControls from "@/components/voice/RecordingControls";
import '@/scenario-studio.css';

const VoiceOrb = lazy(() => import('@/components/spatial/VoiceOrb'));
const ScenarioStage = lazy(() => import('@/components/ScenarioStage'));

export default function VoiceChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get("scenario");
  const mode = params.get("mode") || "basic";
  const dialogMode = params.get("dialogMode") || "goal_oriented";
  const scoring = "daily";
  const { user } = useAuth();
  const parentId=params.get("retry")||null, focus=params.get("focus")||"";
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const visualSamples = useRef([]);
  const collectVisual = useCallback(sample => { if (visualSamples.current.length < 4800) visualSamples.current.push(sample); }, []);
  const [historyOpen,setHistoryOpen]=useState(false),[saveError,setSaveError]=useState("");
  const attemptId=useRef(crypto.randomUUID()),endLock=useRef(false);

  const scenario = getScenario(scenarioId);
  const isGoalOriented = dialogMode === "goal_oriented";
  const scenarioData = isGoalOriented ? scenario?.goalOriented : scenario?.freeTalk;


  const [sceneOpen, setSceneOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(Date.now());
  const chatEndRef = useRef(null);
  const messageRefs = useRef({});
  const replyInputRef = useRef(null);
  const sceneCueRef = useRef('');
  const draftKey = `speaknow-voice-draft:${user?.id||"guest"}:${scenarioId}:${mode}:${dialogMode}:${scoring}:${parentId||"new"}`;
  const requestCueIds = useMemo(() => new Map(), [draftKey]);
  const interaction = useMemo(() => {
    let initialDraft = '';
    let initialMessages=[],initialRecordingId=null;
    try { const saved=JSON.parse(localStorage.getItem(draftKey)||'null');initialDraft=saved?.draft||'';initialMessages=saved?.messages||[];if(saved?.attemptId)attemptId.current=saved.attemptId;
      initialRecordingId=saved?.pendingRecordingId||null;
      if(initialMessages.at(-1)?.role==='user'){const pending=initialMessages.pop();initialDraft=pending.content;initialRecordingId=pending.recordingId||initialRecordingId;}
    } catch { /* Storage unavailable. */ }
    return new VoiceInteraction({
      audio: audioManager, aiRole: scenario?.aiRole, voiceGender: scenario?.aiVoice,
      initialDraft, initialMessages, initialRecordingId,
      saveDraft: text => { const saved=JSON.parse(localStorage.getItem(draftKey)||"{}");localStorage.setItem(draftKey,JSON.stringify({...saved,draft:text})); },
      saveRecording: async recording=>{await learningStore.put("recordings",recording);const previous=JSON.parse(localStorage.getItem(draftKey)||"{}");localStorage.setItem(draftKey,JSON.stringify({...previous,pendingRecordingId:recording.id}));},
      visualFor: text => getDynamicSceneCue(scenarioId, text),
      initialMessage: scenarioData ? { id: `intro-${scenarioId}`, role: 'ai', content: focus ? `Let’s try that situation again. ${scenarioData.firstMessage}` : scenarioData.firstMessage, aiRole: scenario?.aiRole, visual: getDynamicSceneCue(scenarioId, scenarioData.firstMessage), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : null,
      request: (userText, { signal, history, turnId }) => {
        // Retries retain the scene context of the original turn.
        if (!requestCueIds.has(turnId)) requestCueIds.set(turnId, sceneCueRef.current);
        return apiJson('/api/speaking-feedback', { action:'conversation', scenario, scenarioData, history, userText, mode, scoring, isGoalOriented, ...(scenarioId === 'cafe' ? { sceneCueId: requestCueIds.get(turnId) } : {}) }, { signal });
      },
    });
  }, [draftKey, scenario, scenarioData, scenarioId, mode, scoring, isGoalOriented, requestCueIds, focus]);
  const state = useSyncExternalStore(interaction.subscribe, interaction.getSnapshot, interaction.getSnapshot);
  const messages = state.messages;

  const isAiThinking = state.status === 'processing';
  const isSpeaking = state.status === 'speaking';
  const activePlaybackId = state.activePlaybackId;
  const inputState = state.status;
  const energyRef = interaction.energyRef;
  const hasInputEnergy = state.energyAvailable;
  const fallbackNotice = state.error;

  const orbState = resolveVoiceOrbState({ status: state.status });
  const exchanges = messages.filter(message => message.role === 'user').length;
  const wordCount = messages.filter(message => message.role === 'user').reduce((total, message) => total + message.content.split(/\s+/).filter(Boolean).length, 0);
  const latestPartnerMessage = [...messages].reverse().find(message => message.role === 'ai');
  const canUseSceneDraft = !['requesting_permission', 'starting', 'listening', 'stopping', 'finalizing', 'submitting', 'processing', 'completed'].includes(state.status);
  const cafeCueDisabledReason = ['requesting_permission', 'starting', 'listening', 'stopping', 'finalizing', 'submitting', 'processing', 'completed'].includes(state.status)
    ? 'Finish the current turn before choosing a reply draft.'
    : [state.typedText, state.finalText, state.interimText].some(text => text.trim())
      ? 'Your unsent words are kept. Send or clear them before choosing a draft.' : '';
  const focusReply = () => { replyInputRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); replyInputRef.current?.focus({ preventScroll: true }); };
  const useSceneCue = cue => {
    if (cafeCueDisabledReason) return;
    sceneCueRef.current = cue.id;
    interaction.setTypedText(cue.phrase);
    focusReply();
  };
  useEffect(() => { sceneCueRef.current = ''; }, [draftKey]);

  useEffect(() => {
    if (!scenario) navigate('/voice');
  }, [navigate, scenario]);
  useEffect(() => {
    if (!scenario || !scenarioData) return () => interaction.dispose();
    interaction.activate();
    if (user) void localApi.integrations.Core.TrackActivity({ activity_type: 'voice_practice_started', scenario: scenarioId, mode, dialog_mode: dialogMode, scoring_standard: scoring }).catch(error => console.error('Failed to track voice practice start:', error));
    // Initial playback is attempted without an artificial delay. Browsers may
    // require a gesture; text and the explicit Play audio action remain.
    if (interaction.getSnapshot().messages[0]) void interaction.playMessage(interaction.getSnapshot().messages[0].id);
    return () => interaction.dispose();
  }, [interaction, scenario, scenarioData, scenarioId, mode, dialogMode, scoring, user]);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startTime]);
  useEffect(() => {
    if (messages.length > 1 && !window.matchMedia('(max-width: 760px)').matches && !(scenarioId === 'cafe' && sceneOpen)) chatEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [messages, sceneOpen, scenarioId]);

  useEffect(() => interaction.subscribe(() => {
    const current=interaction.getSnapshot();
    try { localStorage.setItem(draftKey,JSON.stringify({pendingRecordingId:current.typedText||current.finalText||current.interimText?JSON.parse(localStorage.getItem(draftKey)||"{}").pendingRecordingId:null,attemptId:attemptId.current,href:location.pathname+location.search,title:scenario?.title,ownerId:user?.id||null,updatedAt:new Date().toISOString(),messages:current.messages,draft:current.typedText||[current.finalText,current.interimText].filter(Boolean).join(' ')})); }
    catch { setSaveError('Draft storage is unavailable. Keep this page open until you save the practice.'); }
  }),[interaction,draftKey]);

  const handleEnd = async () => {
    if(endLock.current)return;endLock.current=true;setSaveError('');setCameraEnabled(false);
    try {
      const finished=await interaction.complete();if(!finished||interaction.disposed)return;
      const endedMessages=[...finished.messages];
      const unsent=finished.typedText||[finished.finalText,finished.interimText].filter(Boolean).join(' ');
      if(unsent.trim()&&endedMessages.at(-1)?.content!==unsent.trim())endedMessages.push({role:'user',content:unsent.trim(),recordingId:await interaction.audioTake?.stop()});
      const answers=endedMessages.flatMap((message,index)=>message.role==='user'?[{questionIndex:index,text:message.content,prompt:endedMessages[index-1]?.content||scenarioData?.goal||scenario.title,recordingId:message.recordingId||null,inputMode:message.recordingId?'voice':'text',durationSeconds:0,startSeconds:null}]:[]);
      if(!answers.length){setSaveError('Say or type an answer before finishing.');interaction.ended=false;interaction.completing=false;interaction.update({status:'idle'});return;}
      for (const answer of answers) { if (answer.recordingId) { const clip = await learningStore.get('recordings',answer.recordingId); answer.durationSeconds = clip?.durationSeconds || 0; answer.startSeconds = clip?.startedAt ? Math.max(0,(clip.startedAt-startTime)/1000) : null; } }
      await saveAttempt({id:attemptId.current,track:'daily',taskId:`daily-${scenarioId}`,title:scenario.title,parentId,focus,answers,visualEvidence:validateVisualEvidence({source:'device-mediapipe',windows:createReviewClips(visualSamples.current,[],Math.min(720,(Date.now()-startTime)/1000))}),context:{scenario:scenarioId,mode,dialogMode},ownerId:user?.id||null,createdAt:new Date(startTime).toISOString()});
      localStorage.removeItem(draftKey);navigate(`/practice/review?id=${attemptId.current}`);
    } catch(error){setSaveError(error.message);}
    finally{endLock.current=false;}
  };

  const handleExit = () => {
    interaction.dispose();
    navigate("/voice");
  };

  if (!scenario) {
    return null;
  }

  return (
    <div className={`speaking-room${scenarioId === 'cafe' && sceneOpen ? ' is-cafe-scene-active' : ''}`} data-interaction-state={state.status}>
      {/* Header */}
      <div className="room-header glass">
        <button onClick={handleExit} className="flex items-center gap-1 text-sm text-accent font-medium">
          <ArrowLeft className="w-4 h-4" />
          Exit
        </button>
        <div className="text-center">
          <h1>{scenario.title}</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase">
          {mode === "advanced" ? "Challenging" : "Everyday"}
        </span>
      </div>

      <div className="room-workspace">
      <section className="room-presence" aria-label="AI speaking studio" onPointerMove={event => {
        if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--room-x', `${((event.clientX - rect.left) / rect.width - 0.5) * 8}px`);
        event.currentTarget.style.setProperty('--room-y', `${((event.clientY - rect.top) / rect.height - 0.5) * 6}px`);
      }} onPointerLeave={event => { event.currentTarget.style.setProperty('--room-x', '0px'); event.currentTarget.style.setProperty('--room-y', '0px'); }}>
        <div className="room-task"><p>{focus || (isGoalOriented ? scenarioData?.goal : scenarioData?.topic || scenario.title)}</p></div>
        <Suspense fallback={<div className="voice-orb"><div className="orb-fallback" /></div>}><VoiceOrb state={orbState} energyRef={energyRef} /></Suspense>
        <div className="room-status" data-state={orbState} role="status"><span className="room-status-dot" /><strong>{{ idle: 'Ready when you are', requesting_permission: 'Allow microphone access', starting: 'Connecting voice input', listening: 'Listening to you', stopping: 'Stopping your microphone', finalizing: 'Confirming your words', submitting: 'Sending your reply', processing: 'Your coach is thinking', speaking: 'Your coach is speaking', completed: 'Practice complete', error: 'Ready to recover' }[state.status]}</strong></div>
        <p className="room-status-detail">{isSpeaking ? 'Browser voice playback' : inputState === 'listening' ? (hasInputEnergy ? 'Your voice, reflected in real time' : 'Listening · voice visualization unavailable in this browser') : ''}</p>
        <button type="button" className="voice-scene-toggle" aria-pressed={cameraEnabled} onClick={() => setCameraEnabled(value => !value)}>{cameraEnabled ? 'Turn camera off' : 'Enable camera analysis (optional)'}</button>
        {cameraEnabled && <CameraPreview onSample={collectVisual} startedAt={startTime} />}
        <div className="room-session-meta"><span>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span><span>{wordCount} words</span></div>
      </section>
      {/* Chat Area */}
      <div className="room-conversation space-y-4" aria-label="Conversation and coaching">
        <button type="button" className="voice-scene-toggle" aria-expanded={sceneOpen} aria-controls="conversation-scene" onClick={() => setSceneOpen(open => !open)}><span>{sceneOpen ? 'Return to the conversation' : `Step into ${scenario.title} · explore your surroundings`}</span><span aria-hidden="true">{sceneOpen ? '−' : '↗'}</span></button>
        {sceneOpen && <div id="conversation-scene" className="voice-scene-panel"><Suspense fallback={<div className="scenario-stage scenario-stage-loading">Preparing your scene…</div>}><ScenarioStage scenario={scenario}
          onUseCue={scenarioId === 'cafe' ? useSceneCue : null}
          cueDisabledReason={cafeCueDisabledReason}
          conversation={scenarioId === 'cafe' ? { status: state.status, reply: latestPartnerMessage?.content || '', isLocal: latestPartnerMessage?.source === 'fallback', canReply: canUseSceneDraft, onReply: focusReply } : null}
          cueOverrides={scenarioId === 'cafe' && !isGoalOriented ? {
            menu: { detail: 'Browse the café menu and ask about the barista’s favourites.', phrase: 'What coffee would you recommend today?' },
            coffee: { detail: 'Talk about how you like your coffee, or ask about milk options.', phrase: 'I usually have a latte. How does it taste with oat milk?' },
            pastry: { detail: 'Ask about pastries and the café’s morning routine.', phrase: 'Which pastry do you enjoy with your morning coffee?' },
          } : null}
        /></Suspense></div>}
        {fallbackNotice && (
          <div className="voice-coach-status glass rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-200">Speaking needs your attention</p>
            <p className="mt-1 text-xs text-amber-100/90 break-words">{fallbackNotice}</p>
          </div>
        )}
        {messages.length>2&&<button className="voice-scene-toggle" onClick={()=>setHistoryOpen(open=>!open)}>{historyOpen?"Show latest exchange":`Earlier conversation (${exchanges} turns)`}</button>}
        {(historyOpen ? messages : messages.slice(-2)).map((msg, i) => (
          <ChatMessage
            key={msg.id || i}
            message={msg}
            compact
            voiceGender={scenario.aiVoice}
            isLatest={i === messages.length - 1}
            isActive={isSpeaking && activePlaybackId === (msg.playbackId || msg.id)}
            onPlay={() => interaction.playMessage(msg.id)}
            playbackDisabled={["requesting_permission", "starting", "listening", "stopping", "finalizing", "submitting", "processing", "completed"].includes(state.status)}
            feedbackInitiallyOpen={false}
            registerRef={(node) => {
              if (!msg.id && !msg.playbackId) return;
              messageRefs.current[msg.playbackId || msg.id] = node;
            }}
          />
        ))}

        {isAiThinking && (
          <div className="flex gap-3 items-center">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
              Coach
            </div>
            <div className="glass rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      </div>
      <div className="room-controls glass space-y-3">
        {saveError&&<p role="alert" className="learning-alert">{saveError}</p>}
        <RecordingControls interaction={interaction} state={state} replyInputRef={replyInputRef} compact />
        <button
          disabled={["stopping", "finalizing"].includes(state.status)}
          onClick={handleEnd}
          className="w-full h-12 rounded-2xl bg-accent/15 text-accent hover:bg-accent/20 transition-colors text-[16px] font-medium flex items-center justify-center gap-2"
        >
          <Volume2 className="w-4 h-4" />
          Finish & review
        </button>
      </div>
    </div>
  );
}
