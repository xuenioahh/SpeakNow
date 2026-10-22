import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Lightbulb, Flag, PanelsTopLeft, CircleCheckBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localApi } from "@/api/localClient";
import LoadingProgressCard from "@/components/LoadingProgressCard";

const FLOW_ICONS = [Flag, PanelsTopLeft, CircleCheckBig];

export default function PresentationAnalysis() {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Preparing your PDF...");
  const [errorMessage, setErrorMessage] = useState("");
  const [fallbackReason, setFallbackReason] = useState("");

  const fileName = sessionStorage.getItem("presentationFile");
  const fileType = sessionStorage.getItem("presentationFileType") || "";

  useEffect(() => {
    if (!fileName) {
      navigate("/presentation");
      return;
    }

    let cancelled = false;
    let intervalId = null;

    const buildFallbackAnalysis = (pageTexts) => ({
      title: fileName || "Presentation PDF",
      overviewCards: [
        { value: `${Math.max((pageTexts || []).length, 1)} page${Math.max((pageTexts || []).length, 1) === 1 ? "" : "s"}` },
        { value: "Lead with the main topic" },
        { value: "One idea per page" },
      ],
      structureCards: [
        {
          step: "Opening",
          title: "State the topic and the goal",
          body: "In the first 20 seconds, tell the audience what this presentation is about and what they should notice.",
        },
        {
          step: "Middle",
          title: "Pick one key point from each section",
          body: "Do not read every page. Name the key term first, then explain why it matters.",
        },
        {
          step: "Closing",
          title: "Finish with the result",
          body: "End by repeating the main conclusion or takeaway in one clean sentence.",
        },
      ],
      focusCards: [
        { title: "Priority words", items: ["topic", "evidence", "result"] },
      ],
      presenterTips: [
        "Open with the topic in one sentence.",
        "On each page, say the key term before you explain it.",
        "Close with one result or takeaway, not a long summary.",
      ],
    });

    const buildAnalysis = async (pageTexts, nextStatusMessage) => {
      try {
        if (nextStatusMessage) {
          setStatusMessage(nextStatusMessage);
        }

        const result = await localApi.integrations.Core.InvokeLLM({
          input: {
            kind: "presentation-analysis",
            fileName,
            pageTexts,
          },
        });

        if (cancelled) return;
        setAnalysis(result || buildFallbackAnalysis(pageTexts));
        setErrorMessage("");
        setFallbackReason(result?.fallback_reason || "");
      } catch (error) {
        console.error("Failed to generate presentation analysis:", error);
        if (cancelled) return;
        setAnalysis(buildFallbackAnalysis(pageTexts));
        setErrorMessage("The automatic plan could not be generated, so a quick fallback plan is shown instead.");
        setFallbackReason(error?.message || "request_failed");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const initialPageTexts = JSON.parse(sessionStorage.getItem("presentationPdfPageTexts") || "[]");
    void buildAnalysis(initialPageTexts, "Opening your practice plan...");

    const isPdf = fileName?.toLowerCase().endsWith(".pdf") || fileType === "application/pdf";
    if (isPdf && sessionStorage.getItem("presentationPdfTextStatus") === "pending") {
      intervalId = window.setInterval(() => {
        const status = sessionStorage.getItem("presentationPdfTextStatus");
        if (status !== "pending") {
          window.clearInterval(intervalId);
          const latestPageTexts = JSON.parse(sessionStorage.getItem("presentationPdfPageTexts") || "[]");
          void buildAnalysis(latestPageTexts, "Refreshing analysis with your PDF content...");
        }
      }, 250);
    }

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [fileName, fileType, navigate]);

  if (loading || !analysis) {
    return (
      <LoadingProgressCard
        title="Preparing practice plan"
        description={statusMessage}
        durationMs={6500}
        steps={[
          "Opening your PDF context",
          "Finding the main structure",
          "Building speaking prompts",
          "Preparing your rehearsal plan",
        ]}
      />
    );
  }

  return (
    <div className="studio-page studio-page-reading">
      <div className="px-4 pt-5 space-y-4">
        {errorMessage && (
          <div className="glass rounded-2xl px-4 py-3">
            <p className="text-[14px] text-amber-200">{errorMessage}</p>
            {fallbackReason && (
              <p className="text-[12px] text-amber-100/80 mt-2 break-words">Reason: {fallbackReason}</p>
            )}
          </div>
        )}
        <div className="px-1">
          <p className="text-[11px] text-muted-foreground">
            Source: {analysis.source === "ai" ? "AI Coaching Suggestion" : "Local preparation guidance"} · slide preparation, not a measurement of your speech
          </p>
        </div>
        <div className="glass rounded-[28px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] uppercase tracking-[0.18em] text-amber-300/80">Presentation Map</p>
              <h1 className="text-[22px] leading-tight font-bold font-space text-foreground mt-1">
                Quick start before practice
              </h1>
              <p className="text-[14px] text-muted-foreground mt-2">{analysis.title}</p>
              {analysis.summary && (
                <p className="text-[15px] text-foreground/85 mt-3 leading-relaxed">
                  {analysis.summary}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {(analysis.overviewCards || []).slice(0, 3).map((card) => (
                  <span key={`${card.title || "card"}-${card.value}`} className="rounded-full bg-white/8 px-3 py-1.5 text-[13px] text-foreground/82">
                    {card.value}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => navigate("/presentation")} className="p-2 rounded-xl hover:bg-white/5">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="glass rounded-2xl p-4">
          <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">Start with this</p>
          <p className="text-[16px] text-foreground leading-relaxed mt-2">
            {analysis.structureCards?.[0]?.body || analysis.presenterTips?.[0] || "Open with the topic in one sentence, then tell the audience what to listen for."}
          </p>
        </motion.div>

        {analysis.documentBlueprint && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-2xl p-4">
            <h2 className="text-[16px] font-semibold text-foreground mb-3">What this file is really about</h2>
            <div className="space-y-2">
              {analysis.documentBlueprint.mainTopic && (
                <p className="text-[14px] text-muted-foreground">
                  <span className="text-foreground font-medium">Main topic:</span> {analysis.documentBlueprint.mainTopic}
                </p>
              )}
              {analysis.documentBlueprint.audienceGoal && (
                <p className="text-[14px] text-muted-foreground">
                  <span className="text-foreground font-medium">Audience should understand:</span> {analysis.documentBlueprint.audienceGoal}
                </p>
              )}
              {analysis.documentBlueprint.sectionLabels?.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {analysis.documentBlueprint.sectionLabels.slice(0, 4).map((item) => (
                    <span key={item} className="px-2.5 py-1.5 rounded-full bg-white/6 text-[13px] text-foreground/85">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3 overflow-x-auto">
                {analysis.structureCards?.map((card, index) => {
                  const Icon = FLOW_ICONS[index] || Flag;
                  return (
                <div key={card.step} className="flex items-center gap-3 min-w-fit">
                  <div className="glass rounded-2xl px-3 py-2.5 flex items-center gap-3 whitespace-nowrap">
                    <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[12px] text-primary font-medium">{card.step}</p>
                      <p className="text-[14px] font-semibold text-foreground">{card.title}</p>
                      {card.body && (
                        <p className="text-[12px] text-muted-foreground mt-1 max-w-[220px] whitespace-normal">
                          {card.body}
                        </p>
                      )}
                    </div>
                  </div>
                  {index < analysis.structureCards.length - 1 && (
                    <div className="w-5 h-px bg-white/12" />
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-300" />
            <h2 className="text-[16px] font-semibold text-foreground">Words to say out loud</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.focusCards?.[0]?.items?.slice(0, 4).map((item) => (
              <span key={item} className="px-2.5 py-1.5 rounded-full bg-amber-500/12 text-[14px] text-amber-100">
                {item}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="glass rounded-2xl p-4">
          <h2 className="text-[16px] font-semibold text-foreground mb-3">Your rehearsal brief</h2>
          <div className="space-y-2">
            {(analysis.presenterTips || []).slice(0, 3).map((tip, index) => (
              <div key={tip} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[12px] font-semibold flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </div>
                <p className="text-[14px] text-muted-foreground">{tip}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => navigate("/presentation")}
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-white/10 hover:bg-white/5"
          >
            Back
          </Button>
          <Button
            onClick={() => navigate("/presentation/practice")}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Practice
          </Button>
        </div>
      </div>
    </div>
  );
}
