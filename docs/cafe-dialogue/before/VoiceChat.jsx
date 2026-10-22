import { lazy, Suspense, useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Volume2 } from "lucide-react";
import { localApi } from "@/api/localClient";
import { getScenario } from "@/lib/scenarios";
import { VoiceInteraction } from "@/lib/voice/VoiceInteraction";
import { resolveVoiceOrbState } from "@/lib/voiceOrbState";
import "@/voice-room.css";
import { audioManager } from "@/lib/audioManager";
import { getDynamicSceneCue, getSceneAsset } from "@/lib/sceneAssets";
import CharacterFigure from "@/components/CharacterFigure";
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
  const mode = params.get("mode");
  const dialogMode = params.get("dialogMode");
  const scoring = params.get("scoring");

  const scenario = getScenario(scenarioId);
  const isGoalOriented = dialogMode === "goal_oriented";
  const scenarioData = isGoalOriented ? scenario?.goalOriented : scenario?.freeTalk;
  const examinerScene = getSceneAsset(scenarioId)?.fallback || null;

  const [sceneOpen, setSceneOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(Date.now());
  const chatEndRef = useRef(null);
  const messageRefs = useRef({});
  const draftKey = `speaknow-voice-draft:${scenarioId}:${mode}:${dialogMode}:${scoring}`;
  const interaction = useMemo(() => {
    let initialDraft = '';
    try { initialDraft = sessionStorage.getItem(draftKey) || ''; } catch { /* Storage unavailable. */ }
    return new VoiceInteraction({
      audio: audioManager, aiRole: scenario?.aiRole, voiceGender: scenario?.aiVoice,
      initialDraft,
      saveDraft: text => text ? sessionStorage.setItem(draftKey, text) : sessionStorage.removeItem(draftKey),
      visualFor: text => getDynamicSceneCue(scenarioId, text),
      initialMessage: scenarioData ? { id: `intro-${scenarioId}`, role: 'ai', content: scenarioData.firstMessage, aiRole: scenario?.aiRole, visual: getDynamicSceneCue(scenarioId, scenarioData.firstMessage), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : null,
      request: (userText, { signal, history }) => localApi.integrations.Core.InvokeLLM({ input: { kind: 'voice-chat', scenario, scenarioData, history, userText, mode, scoring, isGoalOriented } }, { signal }),
    });
  }, [draftKey, scenario, scenarioData, scenarioId, mode, scoring, isGoalOriented]);
  const state = useSyncExternalStore(interaction.subscribe, interaction.getSnapshot, interaction.getSnapshot);
  const messages = state.messages;
  const hasUserSpoken = messages.some(message => message.role === 'user');
  const isAiThinking = state.status === 'processing';
  const isSpeaking = state.status === 'speaking';
  const activePlaybackId = state.activePlaybackId;
  const inputState = state.status;
  const energyRef = interaction.energyRef;
  const hasInputEnergy = state.energyAvailable;
  const fallbackNotice = state.error;
  const timing = state.timings[state.timings.length - 1];
  const timingDuration = (begin, end) => begin == null || end == null ? 'Not available yet' : `${Math.round(Math.max(0, end - begin))} ms`;
  const orbState = resolveVoiceOrbState({ status: state.status });
  const exchanges = messages.filter(message => message.role === 'user').length;
  const wordCount = messages.filter(message => message.role === 'user').reduce((total, message) => total + message.content.split(/\s+/).filter(Boolean).length, 0);

  useEffect(() => {
    if (!scenario) navigate('/voice');
  }, [navigate, scenario]);
  useEffect(() => {
    if (!scenario || !scenarioData) return () => interaction.dispose();
    interaction.activate();
    void localApi.integrations.Core.TrackActivity({ activity_type: 'voice_practice_started', scenario: scenarioId, mode, dialog_mode: dialogMode, scoring_standard: scoring }).catch(error => console.error('Failed to track voice practice start:', error));
    // Initial playback is attempted without an artificial delay. Browsers may
    // require a gesture; text and the explicit Play audio action remain.
    if (interaction.getSnapshot().messages[0]) void interaction.playMessage(interaction.getSnapshot().messages[0].id);
    return () => interaction.dispose();
  }, [interaction, scenario, scenarioData, scenarioId, mode, dialogMode, scoring]);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startTime]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [messages]);

  const handleEnd = async () => {
    const finished = await interaction.complete();
    if (!finished || interaction.disposed) return;
    const endedMessages = finished.messages;
    const endedUsers = endedMessages.filter(message => message.role === "user");
    const endedWords = endedUsers.reduce((sum, message) => sum + message.content.split(/\s+/).filter(Boolean).length, 0);
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const endParams = new URLSearchParams({
      scenario: scenarioId,
      mode,
      dialogMode,
      scoring,
      duration: duration.toString(),
      words: endedWords.toString(),
      exchanges: endedUsers.length.toString(),
    });

    // Store messages in sessionStorage for report
    sessionStorage.setItem("voiceMessages", JSON.stringify(endedMessages));
    sessionStorage.setItem(
      "voiceReportContext",
      JSON.stringify({
        scenario: scenarioId,
        mode,
        dialogMode,
        scoring,
        duration,
        words: endedWords,
        exchanges: endedUsers.length,
      })
    );
    navigate(`/voice/report?${endParams.toString()}`);
  };

  const handleExit = () => {
    interaction.dispose();
    navigate("/voice");
  };

  if (!scenario) {
    return null;
  }

  return (
    <div className="speaking-room" data-interaction-state={state.status}>
      {/* Header */}
      <div className="room-header glass">
        <button onClick={handleExit} className="flex items-center gap-1 text-sm text-accent font-medium">
          <ArrowLeft className="w-4 h-4" />
          Exit
        </button>
        <div className="text-center">
          <p className="room-eyebrow">LIVE SPEAKING STUDIO</p><h1>{scenario.title}</h1><p className="text-xs text-muted-foreground">{scenario.aiRole} · {exchanges} exchanges</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase">
          {scoring}
        </span>
      </div>

      <div className="room-workspace">
      <section className="room-presence" aria-label="AI speaking studio" onPointerMove={event => {
        if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--room-x', `${((event.clientX - rect.left) / rect.width - 0.5) * 8}px`);
        event.currentTarget.style.setProperty('--room-y', `${((event.clientY - rect.top) / rect.height - 0.5) * 6}px`);
      }} onPointerLeave={event => { event.currentTarget.style.setProperty('--room-x', '0px'); event.currentTarget.style.setProperty('--room-y', '0px'); }}>
        <div className="room-task"><span className="room-eyebrow">{isGoalOriented ? 'YOUR MISSION' : 'YOUR CONVERSATION'}</span><p>{isGoalOriented ? scenarioData?.goal : scenarioData?.topic || scenario.title}</p></div>
        <Suspense fallback={<div className="voice-orb"><div className="orb-fallback" /></div>}><VoiceOrb state={orbState} energyRef={energyRef} /></Suspense>
        <div className="room-status" data-state={orbState} role="status"><span className="room-status-dot" /><strong>{{ idle: 'Ready when you are', requesting_permission: 'Allow microphone access', starting: 'Connecting voice input', listening: 'Listening to you', stopping: 'Stopping your microphone', finalizing: 'Confirming your words', submitting: 'Sending your reply', processing: 'Your coach is thinking', speaking: 'Your coach is speaking', completed: 'Practice complete', error: 'Ready to recover' }[state.status]}</strong></div>
        <p className="room-status-detail">{isSpeaking ? 'Browser voice playback' : inputState === 'listening' ? (hasInputEnergy ? 'Your voice, reflected in real time' : 'Listening · voice visualization unavailable in this browser') : 'A little space to find your words.'}</p>
        <div className="room-session-meta"><span>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span><span>{wordCount} words</span><span>{scoring?.toUpperCase()}</span></div>
      </section>
      {/* Chat Area */}
      <div className="room-conversation space-y-4" aria-label="Conversation and coaching">
        <button type="button" className="voice-scene-toggle" aria-expanded={sceneOpen} aria-controls="conversation-scene" onClick={() => setSceneOpen(open => !open)}><span>{sceneOpen ? 'Return to the conversation' : `Step into ${scenario.title} · explore your surroundings`}</span><span aria-hidden="true">{sceneOpen ? '−' : '↗'}</span></button>
        {sceneOpen && <div id="conversation-scene" className="voice-scene-panel"><Suspense fallback={<div className="scenario-stage scenario-stage-loading">Preparing your scene…</div>}><ScenarioStage scenario={scenario} /></Suspense></div>}
        {!sceneOpen && isGoalOriented && examinerScene && (
          <div className="flex justify-center">
            <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(15,23,42,0.32))] px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/75">Virtual Examiner</p>
                <div className="mt-5 flex justify-center">
                  <CharacterFigure
                    fallback={String(scenario.aiRole || "E").slice(0, 1)}
                    size="large"
                    accent="cyan"
                    label={scenario.aiRole}
                    subtitle={scenarioData?.context || examinerScene.tip}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {fallbackNotice && (
          <div className="voice-coach-status glass rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-200">Speaking needs your attention</p>
            <p className="mt-1 text-xs text-amber-100/90 break-words">{fallbackNotice}</p>
          </div>
        )}
        <p className="room-eyebrow">CONVERSATION · YOUR WORDS, THEIR RESPONSE</p>
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id || i}
            message={msg}
            voiceGender={scenario.aiVoice}
            isLatest={i === messages.length - 1}
            isActive={isSpeaking && activePlaybackId === (msg.playbackId || msg.id)}
            onPlay={() => interaction.playMessage(msg.id)}
            playbackDisabled={["requesting_permission", "starting", "listening", "stopping", "finalizing", "submitting", "processing", "completed"].includes(state.status)}
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
        {!hasUserSpoken && (
          <details className="room-guidance">
            <summary className="flex items-center gap-2 mb-2">
              <Mic className="w-4 h-4 text-primary" />
              <span className="text-[15px] font-semibold text-foreground">Speaking Guidance</span>
            </summary>
            <div className="space-y-1.5">
              <p className="text-[14px] text-muted-foreground">1. Answer in full sentences before sending.</p>
              <p className="text-[14px] text-muted-foreground">2. Add one reason or example to sound more natural.</p>
              <p className="text-[14px] text-muted-foreground">3. Use the replay button on AI replies if you want listening support.</p>
            </div>
          </details>
        )}
        <RecordingControls interaction={interaction} state={state} />
        {timing && <details className="voice-timing"><summary>Response timing</summary><dl>
          <div><dt>Final recognition</dt><dd>{timingDuration(timing.t1, timing.t2)}</dd></div>
          <div><dt>Coach response</dt><dd>{timingDuration(timing.requestStarted, timing.t3)}</dd></div>
          <div><dt>Voice start</dt><dd>{timingDuration(timing.t3, timing.t4)}</dd></div>
          <div><dt>Voice duration</dt><dd>{timingDuration(timing.t4, timing.t5)}</dd></div>
        </dl><p>Measured events from this turn. Missing stages stay unavailable; network and browser voice delays vary.</p></details>}
        <button
          disabled={["stopping", "finalizing", "completed"].includes(state.status)}
          onClick={handleEnd}
          className="w-full h-12 rounded-2xl bg-accent/15 text-accent hover:bg-accent/20 transition-colors text-[16px] font-medium flex items-center justify-center gap-2"
        >
          <Volume2 className="w-4 h-4" />
          End Practice and View Summary
        </button>
      </div>
    </div>
  );
}
