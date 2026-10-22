import PresentationCapture from '@/impact/PresentationCapture';
import { useAuth } from '@/lib/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Pause, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import DocumentViewer from "@/components/presentation/DocumentViewer";
import CameraPreview from "@/components/presentation/CameraPreview";
import LiveScorePanel from "@/components/presentation/LiveScorePanel";
import { localApi } from "@/api/localClient";

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function PresentationPractice() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [setup] = useState(() => {
    let stored;
    try { stored = JSON.parse(sessionStorage.getItem('presentationImpactSetup') || 'null'); } catch { /* Invalid old state. */ }
    const value = location.state?.impactPractice || (stored?.userId === user?.id ? stored : null);
    return value?.context ? { ...value, userId: user.id, attemptId: value.attemptId || crypto.randomUUID() } : null;
  });
  useEffect(() => {
    if (setup) sessionStorage.setItem('presentationImpactSetup', JSON.stringify(setup));
  }, [setup]);
  if (setup?.context) return <OralPresentationPractice setup={setup} onExit={() => navigate('/presentation')} onSaved={session => { sessionStorage.removeItem('presentationImpactSetup'); navigate(`/presentation/report?session=${session.id}`); }} />;
  return <LegacyPresentationPractice />;
}

function OralPresentationPractice({ setup, onExit, onSaved }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const fileUrl = sessionStorage.getItem('presentationFileUrl');
  const [showSlides, setShowSlides] = useState(Boolean(fileUrl));
  return <div className="studio-page impact-studio"><div className="impact-workspace">
    <header className="impact-header"><h1>{setup.kind === 'moment' ? 'Retry one important moment' : 'Your 5-minute English presentation'}</h1><span>{setup.context.targetAudience} Audience</span></header>
    {showSlides && <div className="glass rounded-2xl p-3">
      <DocumentViewer currentPage={currentPage} onTotalPages={setTotalPages} />
      <div className="impact-actions"><Button variant="outline" onClick={() => setShowSlides(false)}>Continue without slides</Button><Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => page - 1)}>Previous slide</Button><span>{currentPage} / {totalPages || '…'}</span><Button variant="outline" disabled={!totalPages || currentPage >= totalPages} onClick={() => setCurrentPage(page => page + 1)}>Next slide</Button></div>
      <p className="text-sm text-muted-foreground">Slides are optional. A missing or unavailable PDF never blocks your recording.</p>
    </div>}
    <PresentationCapture key={setup.attemptId} attemptId={setup.attemptId} userId={setup.userId} context={setup.context} retry={setup} fileName={sessionStorage.getItem('presentationFile') || setup.context.topic} pageTimings={[]} totalPages={showSlides ? totalPages : 0} onSaved={onSaved} onExit={onExit} />
  </div></div>;
}

function LegacyPresentationPractice() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const impactSetup = null;

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [pageTimings, setPageTimings] = useState(() => {
    const saved = sessionStorage.getItem("presentationPageTimings");
    return saved ? JSON.parse(saved) : [];
  });
  const [transcript, setTranscript] = useState(() => sessionStorage.getItem("presentationLiveTranscript") || "");
  const [transcriptSupported, setTranscriptSupported] = useState(true);
  const [recognitionStatus, setRecognitionStatus] = useState("starting");
  const [isPaused, setIsPaused] = useState(false);
  const [liveScores, setLiveScores] = useState({});
  const [pauseHistory, setPauseHistory] = useState(() => {
    const saved = sessionStorage.getItem("presentationPauseHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const [transcriptHistory, setTranscriptHistory] = useState(() => {
    const saved = sessionStorage.getItem("presentationTranscriptHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldRestartRecognitionRef = useRef(true);
  const isPausedRef = useRef(false);
  const transcriptRef = useRef(transcript);
  const liveScoresRef = useRef(liveScores);
  const pageStartTimeRef = useRef(Date.now());
  const startTimeRef = useRef(Date.now() - (parseInt(sessionStorage.getItem("presentationElapsed") || "0", 10) * 1000));

  const fileName = sessionStorage.getItem("presentationFile");
  const fileUrl = sessionStorage.getItem("presentationFileUrl");
  const pdfPageTexts = JSON.parse(sessionStorage.getItem("presentationPdfPageTexts") || "[]");
  const isResume = params.get("resume") === "1";

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const persistSession = useCallback((nextPageTimings = pageTimings, options = {}) => {
    const transcriptValue = options.transcript ?? transcript;
    const transcriptHistoryValue = options.transcriptHistory ?? transcriptHistory;
    sessionStorage.setItem("presentationDuration", elapsed.toString());
    sessionStorage.setItem("presentationElapsed", elapsed.toString());
    sessionStorage.setItem("presentationTotalPages", totalPages.toString());
    sessionStorage.setItem("presentationPageTimings", JSON.stringify(nextPageTimings));
    sessionStorage.setItem("presentationLiveTranscript", transcriptValue);
    sessionStorage.setItem("presentationTranscriptHistory", JSON.stringify(transcriptHistoryValue));
    sessionStorage.setItem(
      "presentationTranscriptCombined",
      [...transcriptHistoryValue, transcriptValue].filter(Boolean).join(" ").trim()
    );
  }, [elapsed, pageTimings, totalPages, transcript, transcriptHistory]);

  useEffect(() => {
    if (!fileName || !fileUrl) {
      navigate("/presentation");
    }
  }, [fileName, fileUrl, navigate]);

  useEffect(() => {
    if (isResume) {
      setIsPaused(false);
      navigate("/presentation/practice", { replace: true });
    }
  }, [isResume, navigate]);

  const stopRecognition = useCallback(() => {
    shouldRestartRecognitionRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setTranscriptSupported(false);
      setRecognitionStatus("unsupported");
      return;
    }

    shouldRestartRecognitionRef.current = true;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    setTranscriptSupported(true);
    setRecognitionStatus("listening");

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = 0; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }

      const combined = `${finalText} ${interimText}`.trim();
      setTranscript(combined);
      sessionStorage.setItem("presentationLiveTranscript", combined);
      setRecognitionStatus("listening");
    };

    recognition.onerror = (event) => {
      console.error("Presentation speech recognition error:", event.error);

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldRestartRecognitionRef.current = false;
        setTranscriptSupported(false);
        setRecognitionStatus("blocked");
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        return;
      }

      if (event.error === "no-speech" || event.error === "aborted") {
        setRecognitionStatus("waiting");
        return;
      }

      setRecognitionStatus("error");
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (!shouldRestartRecognitionRef.current || isPausedRef.current) return;

      setRecognitionStatus("restarting");
      window.setTimeout(() => {
        if (!shouldRestartRecognitionRef.current || isPausedRef.current) return;
        startRecognition();
      }, 200);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      console.error("Failed to start presentation speech recognition:", error);
      recognitionRef.current = null;
      setRecognitionStatus("error");
    }
  }, []);

  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      setRecognitionStatus("paused");
    } else if (transcriptSupported) {
      setRecognitionStatus("starting");
    }
  }, [isPaused, transcriptSupported]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setTranscriptSupported(false);
      setRecognitionStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    liveScoresRef.current = liveScores;
  }, [liveScores]);

  useEffect(() => {
    sessionStorage.setItem(
      "presentationPauseFeedbackLive",
      JSON.stringify({
        transcript,
        page: currentPage,
        elapsed,
        scores: liveScores,
        history: pauseHistory,
        currentPageText: pdfPageTexts[currentPage - 1] || "",
        updatedAt: Date.now(),
      })
    );
  }, [currentPage, elapsed, liveScores, pauseHistory, pdfPageTexts, transcript]);

  useEffect(() => {
    if (isPaused) return undefined;

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isPaused]);

  useEffect(() => {
    if (isPaused) {
      stopRecognition();
      return undefined;
    }

    if (impactSetup) { stopRecognition(); return undefined; }
    startRecognition();
    return () => stopRecognition();
  }, [isPaused, startRecognition, stopRecognition]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    stopRecognition();
  }, [stopRecognition]);

  const recordPageTime = useCallback((fromPage) => {
    const timeSpent = Math.floor((Date.now() - pageStartTimeRef.current) / 1000);
    const updated = [...pageTimings];
    updated[fromPage - 1] = timeSpent;
    setPageTimings(updated);
    pageStartTimeRef.current = Date.now();
    return updated;
  }, [pageTimings]);

  const handlePrev = () => {
    if (currentPage <= 1) return;
    const updated = recordPageTime(currentPage);
    persistSession(updated);
    setCurrentPage((page) => page - 1);
  };

  const handleNext = () => {
    if (currentPage >= totalPages) return;
    const updated = recordPageTime(currentPage);
    persistSession(updated);
    setCurrentPage((page) => page + 1);
  };

  const handleExit = () => {
    clearInterval(timerRef.current);
    stopRecognition();
    sessionStorage.removeItem("presentationElapsed");
    sessionStorage.removeItem("presentationLiveTranscript");
    sessionStorage.removeItem("presentationPauseFeedbackPayload");
    sessionStorage.removeItem("presentationPauseHistory");
    sessionStorage.removeItem("presentationTranscriptHistory");
    sessionStorage.removeItem("presentationTranscriptCombined");
    navigate("/presentation");
  };

  const handlePause = () => {
    clearInterval(timerRef.current);
    const updated = recordPageTime(currentPage);
    setIsPaused(true);
    stopRecognition();
    const latestTranscript = transcriptRef.current;
    const latestScores = liveScoresRef.current;
    const nextTranscriptHistory = [...transcriptHistory, latestTranscript].filter(Boolean);
    setTranscriptHistory(nextTranscriptHistory);
    const nextHistory = [
      ...pauseHistory,
      {
        page: currentPage,
        elapsed,
        },
    ];
    setPauseHistory(nextHistory);
    sessionStorage.setItem("presentationPauseHistory", JSON.stringify(nextHistory));
    sessionStorage.setItem("presentationTranscriptHistory", JSON.stringify(nextTranscriptHistory));
    sessionStorage.setItem("presentationTranscriptCombined", nextTranscriptHistory.join(" ").trim());
    sessionStorage.setItem("presentationLiveTranscript", "");
    const feedbackPayload = {
      transcript: latestTranscript,
      page: currentPage,
      elapsed,
      scores: latestScores,
      history: nextHistory,
      currentPageText: pdfPageTexts[currentPage - 1] || "",
      updatedAt: Date.now(),
    };
    sessionStorage.setItem("presentationPauseFeedbackPayload", JSON.stringify(feedbackPayload));
    sessionStorage.setItem("presentationPauseFeedbackLive", JSON.stringify(feedbackPayload));
    void localApi.integrations.Core.TrackActivity({
      activity_type: "presentation_paused",
      page: currentPage,
      elapsed,
      current_page_text_preview: (pdfPageTexts[currentPage - 1] || "").slice(0, 220),
    });
    setTranscript("");
    persistSession(updated, {
      transcript: "",
      transcriptHistory: nextTranscriptHistory,
    });
    navigate("/presentation/feedback");
  };

  const handleFinish = () => {
    clearInterval(timerRef.current);
    const updated = recordPageTime(currentPage);
    persistSession(updated);
    stopRecognition();
    navigate("/presentation/report");
  };

  const transcriptPreview = useMemo(() => {
    if (!transcriptSupported) {
      return recognitionStatus === "blocked"
        ? "Microphone access was blocked. Allow microphone permission in the browser, then reopen practice."
        : "Live transcription is not supported in this browser.";
    }
    if (!transcript.trim()) return "Start speaking to see live transcription here.";
    return transcript;
  }, [transcript, transcriptSupported, recognitionStatus]);

  const transcriptStatusLabel = useMemo(() => {
    if (!transcriptSupported) return recognitionStatus === "blocked" ? "Mic blocked" : "Unavailable";
    if (recognitionStatus === "restarting") return "Reconnecting";
    if (recognitionStatus === "waiting") return "Listening";
    if (recognitionStatus === "paused") return "Paused";
    if (recognitionStatus === "starting") return "Starting";
    if (recognitionStatus === "error") return "Retrying";
    return "Realtime";
  }, [recognitionStatus, transcriptSupported]);

  if (!fileName || !fileUrl) {
    return null;
  }

  return (
    <div className="presentation-room h-dvh flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass flex-shrink-0">
        <button onClick={handleExit} className="flex items-center gap-1.5 text-[15px] text-accent font-medium">
          <X className="w-4 h-4" />
          Exit
        </button>
        <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5">
          <Timer className="w-4 h-4 text-primary" />
          <span className="text-[15px] font-mono text-foreground">{formatTime(elapsed)}</span>
        </div>
        <div className="text-[15px] text-muted-foreground truncate max-w-[150px] text-right">{fileName}</div>
      </div>

      <div className="presentation-workspace flex-1 flex gap-3 p-3 min-h-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="presentation-document flex-1 glass rounded-2xl overflow-hidden relative min-h-0">
            <DocumentViewer currentPage={currentPage} onTotalPages={setTotalPages} />
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <button
              aria-label="Previous slide"
              onClick={handlePrev}
              disabled={currentPage <= 1}
              className="p-2 rounded-xl glass hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[15px] text-muted-foreground">
              Page {currentPage} / {totalPages}
            </span>
            <button
              aria-label="Next slide"
              onClick={handleNext}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-xl glass hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="glass rounded-2xl mt-3 p-4 min-h-[120px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-semibold text-foreground">Live Transcript</h3>
              <span className="text-[14px] text-muted-foreground">
                {transcriptStatusLabel}
              </span>
            </div>
            <p className="text-[15px] text-muted-foreground leading-relaxed">{transcriptPreview}</p>
          </div>
        </div>

        <div className="presentation-sidebar w-56 flex-shrink-0 flex flex-col gap-2">
          <CameraPreview />
          <div className="flex-1 overflow-auto min-h-0">
            <LiveScorePanel onScoresChange={setLiveScores} />
          </div>
        </div>
      </div>

      <div className="presentation-controls border-t border-white/5 glass px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <Button
            onClick={handlePause}
            variant="outline"
            className="w-full h-12 rounded-2xl border-white/10 hover:bg-white/5 text-[16px]"
          >
            <Pause className="w-4 h-4 mr-2" />
            Pause and Review
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
            Use this when you want feedback on the current page before moving on.
          </p>
        </div>
        <div className="flex-1">
          <Button
            onClick={handleFinish}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 text-[16px]"
          >
            Finish Session
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
            Use this after the last page or when you want the full report now.
          </p>
        </div>
      </div>
    </div>
  );
}
