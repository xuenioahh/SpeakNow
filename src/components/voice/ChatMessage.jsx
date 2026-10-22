import { motion } from "framer-motion";
import { Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { audioManager } from "@/lib/audioManager";

export default function ChatMessage({ message, voiceGender, isActive = false, isLatest = false, registerRef, onPlay, playbackDisabled = false, feedbackInitiallyOpen = true }) {
  const isUser = message.role === "user";
  const [showFeedback, setShowFeedback] = useState(feedbackInitiallyOpen);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handlePlayAudio = async () => {
    if (playbackDisabled) return;
    if (onPlay) { await onPlay(); return; }
    if (isPlaying) { audioManager.stop(); return; }
    setAudioFailed(false);
    setIsPlaying(true);
    const ok = await audioManager.playAIVoice(message.content, voiceGender, {
      concise: true,
      maxSentences: 2,
      maxChars: 180,
      playbackId: message.playbackId || message.id,
    });
    if (mountedRef.current) { setIsPlaying(false); setAudioFailed(!ok); }
  };

  return (
    <motion.div
      ref={registerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-active={isActive} data-latest={isLatest}
      className={`studio-message flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          isUser
            ? "bg-slate-700 text-white"
            : "bg-slate-600 text-white"
      }`}>
        {isUser ? "You" : "AI"}
      </div>

      <div className={`flex flex-col max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Name + Time */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? "You" : message.aiRole || "Coach"}
          </span>
          {!isUser && message.source === "fallback" && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
              Local
            </span>
          )}
          {!isUser && message.model && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
              {message.model}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/60">{message.time}</span>
        </div>

        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-3 border transition-colors ${
          isUser 
            ? "bg-primary text-primary-foreground rounded-tr-md border-primary/20" 
            : isActive
              ? "glass rounded-tl-md border-cyan-400/50 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
              : "glass rounded-tl-md border-white/5"
        }`}>
          <p className="text-sm leading-relaxed">{message.content}</p>
          {!isUser && message.fallbackReason && (
            <p className="mt-2 text-[10px] text-amber-200/90 break-words">
              Reason: {message.fallbackReason}
            </p>
          )}
          {!isUser && message.visual && (
            <div className="mt-3 max-w-[220px] rounded-2xl overflow-hidden border border-white/8 bg-black/20">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={message.visual.src}
                  alt={message.visual.alt}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[11px] font-medium text-foreground/90">{message.visual.label || "Visual cue"}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{message.visual.tip}</p>
              </div>
            </div>
          )}
        </div>

        {/* AI voice button */}
        {!isUser && (
          <div className="mt-1">
            <button 
              onClick={handlePlayAudio}
              disabled={playbackDisabled}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <Volume2 className={`w-3 h-3 ${(onPlay ? isActive : isPlaying) ? "text-primary" : ""}`} />
              {(onPlay ? isActive : isPlaying) ? "Stop audio" : "Play audio"}
            </button>
            {audioFailed && (
              <p className="text-[10px] text-accent mt-1">Audio playback is unavailable in this browser right now.</p>
            )}
          </div>
        )}

        {/* Feedback for user messages */}
        {isUser && message.feedback && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 w-full"
          >
            <button
              onClick={() => setShowFeedback(!showFeedback)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-1"
            >
              Coach note · AI suggestion
              {showFeedback ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showFeedback && (
              <div className="glass rounded-xl px-3 py-2.5 space-y-1.5">
                {message.feedback.grammar && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-amber-400 font-medium">Grammar:</span>{" "}
                    {message.feedback.grammar}
                  </p>
                )}
                {message.feedback.vocabulary && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-emerald-400 font-medium">Vocabulary:</span>{" "}
                    {message.feedback.vocabulary}
                  </p>
                )}
                {message.feedback.pronunciation && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-cyan-400 font-medium">Pronunciation:</span>{" "}
                    {message.feedback.pronunciation}
                  </p>
                )}
                {message.feedback.task && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-violet-400 font-medium">Task:</span>{" "}
                    {message.feedback.task}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
