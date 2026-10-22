import { createLatestResource } from '@/lib/latestResource';
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { localApi } from "@/api/localClient";
import { audioManager } from "@/lib/audioManager";

export default function PresentationFeedback() {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const [fallbackReason, setFallbackReason] = useState("");
  const spokenSnapshotRef = useRef(null);
  const mountedRef = useRef(true);
  const playbackGeneration = useRef(0);
  const [loadError, setLoadError] = useState("");

  const speakText = async (text) => {
    if (!text) return;
    const generation = ++playbackGeneration.current;
    const ok = await audioManager.playAIVoice(text, "female");
    if (mountedRef.current && generation === playbackGeneration.current) setAudioFailed(!ok);
  };

  useEffect(() => {
    mountedRef.current = true;
    let latestPayload, lastRequestedKey = null, retryAfter = 0;
    const reader = createLatestResource({
      load: async () => {
        const payload = latestPayload;
        const result = await localApi.integrations.Core.InvokeLLM({ input: { kind: 'presentation-pause-feedback', ...payload } });
        return { result, payload };
      },
      onValue: ({ result, payload }) => {
        setFeedback(result);
        setFallbackReason(result?.fallback_reason || '');
        setLastUpdatedAt(payload.updatedAt || Date.now());
        setLoadError('');
      },
      onError: () => { setLoadError('Feedback could not be refreshed. Your practice data is kept; return to practice or wait for retry.'); lastRequestedKey = null; retryAfter = Date.now() + 1500; },
    });
    const refreshFeedback = () => {
      if (Date.now() < retryAfter) return;
      try {
        const payload = JSON.parse(sessionStorage.getItem('presentationPauseFeedbackLive') || sessionStorage.getItem('presentationPauseFeedbackPayload') || 'null');
        if (!payload) { navigate('/presentation/practice'); return; }
        const key = JSON.stringify(payload);
        if (key === lastRequestedKey) return;
        lastRequestedKey = key; latestPayload = payload;
        void reader.refresh();
      } catch { setLoadError('Saved feedback data could not be read. Return to practice and pause again.'); }
    };
    refreshFeedback();
    const interval = window.setInterval(refreshFeedback, 300);
    return () => { mountedRef.current = false; reader.dispose(); window.clearInterval(interval); };
  }, [navigate]);

  useEffect(() => {
    if (!feedback) return;

    if (spokenSnapshotRef.current === lastUpdatedAt) return;

    const summary = [
      `AI Coaching Suggestion. ${feedback.title}.`,
      feedback.priorityCards?.[0]?.body || "",
      feedback.priorityCards?.[1]?.body || "",
    ]
      .filter(Boolean)
      .join(" ");

    const generation = ++playbackGeneration.current;
    audioManager.playAIVoice(summary, "female").then((ok) => {
      if (!mountedRef.current || generation !== playbackGeneration.current) return;
      setAudioFailed(!ok);
      spokenSnapshotRef.current = lastUpdatedAt;
    });

    return () => {
      if (generation === playbackGeneration.current) playbackGeneration.current++;
      audioManager.stop();
    };
  }, [feedback, lastUpdatedAt]);

  if (!feedback) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3"><p className="text-[15px] text-muted-foreground" role={loadError ? 'alert' : 'status'}>{loadError || 'Preparing feedback...'}</p>{loadError && <Button onClick={() => navigate('/presentation/practice?resume=1')}>Return to practice</Button>}</div>
      </div>
    );
  }

  return (
    <div className="studio-page studio-page-reading">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button onClick={() => navigate("/presentation/practice?resume=1")} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div>
          <h2 className="font-semibold text-foreground">Pause Feedback</h2>
          <p className="text-[14px] text-muted-foreground">One fix before you continue</p>
        </div>
      </div>

      {loadError && <p role="alert" className="px-4 py-3 text-sm text-amber-200">{loadError}</p>}
      {audioFailed && (
        <div className="px-4 pt-3">
          <p className="text-[13px] text-accent">Voice playback is unavailable right now in this browser.</p>
        </div>
      )}
      <div className="px-4 pt-3">
        <p className="text-[11px] text-muted-foreground">
          Source: {feedback.source === "ai" ? "AI-generated" : "Fallback"}
        </p>
        {feedback.source === "ai" && (
          <p className="text-[11px] text-emerald-200/80 mt-1 break-words">
            Model: {feedback.provider || "unknown"} / {feedback.model || "unknown"}
          </p>
        )}
        {fallbackReason && (
          <p className="text-[12px] text-amber-100/80 mt-2 break-words">Reason: {fallbackReason}</p>
        )}
      </div>

      <div className="px-4 py-4 space-y-3">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => speakText(feedback.nextStep)}
          className="glass rounded-2xl p-4 w-full text-left border border-primary/20"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-foreground">Say this now</p>
            <Volume2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="text-[14px] text-primary mt-2">{feedback.nextStep}</p>
        </motion.button>

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          onClick={() => speakText(`AI Coaching Suggestion. ${feedback.priorityCards?.[1]?.body || feedback.nextStep}`)}
          className="glass rounded-2xl p-4 w-full text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">Current checkpoint</p>
              <p className="text-[16px] font-semibold text-foreground mt-2">{feedback.title}</p>
              <p className="text-[14px] text-muted-foreground mt-1">{feedback.elapsedLabel}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold font-space text-primary">Not measured</div>
              <p className="text-[13px] text-muted-foreground mt-1">AI Coaching Suggestion</p>
            </div>
          </div>
        </motion.button>

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          onClick={() => speakText(`${feedback.priorityCards?.[1]?.title || "Fix first"}. ${feedback.priorityCards?.[1]?.body || feedback.nextStep}`)}
          className="glass rounded-2xl p-4 w-full text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-foreground">{feedback.priorityCards?.[1]?.title || "Fix this first"}</h3>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-primary">Suggestion</span>
              <span className="text-[12px] text-muted-foreground">listen</span>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground mt-2">{feedback.priorityCards?.[1]?.body || feedback.nextStep}</p>
        </motion.button>

        {feedback.pageContentPreview && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="relative overflow-hidden rounded-[24px] border border-cyan-300/18 bg-gradient-to-br from-cyan-500/12 via-sky-500/8 to-transparent p-4"
          >
            <div className="absolute right-[-10%] top-[-18%] h-24 w-24 rounded-full bg-cyan-300/12 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">Slide focus</p>
                <h3 className="text-[16px] font-semibold text-foreground mt-2">What to highlight on this page</h3>
              </div>
              <button
                type="button"
                onClick={() => speakText(feedback.pageContentPreview)}
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-white/6 px-3 py-1.5 text-[12px] text-cyan-100 hover:bg-white/10 transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Listen
              </button>
            </div>
            <div className="relative mt-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
              <p className="text-[14px] leading-7 text-foreground/92">{feedback.pageContentPreview}</p>
            </div>
          </motion.div>
        )}

        {feedback.evidenceLine && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="glass rounded-2xl p-4"
          >
            <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">Why this feedback</p>
            <p className="text-[14px] text-foreground/90 mt-2 leading-relaxed">{feedback.evidenceLine}</p>
          </motion.div>
        )}

        <div className="pt-2">
          <Button
            onClick={() => navigate("/presentation/practice?resume=1")}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600"
          >
            <Play className="w-4 h-4 mr-2" />
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
