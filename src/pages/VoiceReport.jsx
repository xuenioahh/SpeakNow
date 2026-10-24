import { hasReportedScore, displayScore, completeScoreVector } from '@/lib/reportDisplay';
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Home, CheckCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localApi } from "@/api/localClient";
import { getScenario } from "@/lib/scenarios";
import { generateVoiceReport } from "@/lib/localReports";
import RadarChart from "@/components/report/RadarChart";
import { toast } from "sonner";
import LoadingProgressCard from "@/components/LoadingProgressCard";
import { getExamStandard, getScoreDescriptor, normalizeExamScore, scoreMax } from "@/lib/examStandards";

function safeParseMessages(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseObject(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeReport(report, scoring) {
  if (!report || typeof report !== "object") return report;
  const rawScores = report.scores && typeof report.scores === "object" ? report.scores : {};
  const legacyToefl = scoring === "toefl" && Object.values(rawScores).some(value => Number(value) > 6);
  const scores = Object.fromEntries(Object.entries(rawScores).map(([key, value]) => [
    key,
    normalizeExamScore(value, scoring, { legacyToefl }),
  ]));
  const values = Object.values(scores).filter(value => Number.isFinite(value));
  const totalScore = values.length
    ? normalizeExamScore(values.reduce((sum, value) => sum + value, 0) / values.length, scoring)
    : hasReportedScore(report.totalScore) ? normalizeExamScore(report.totalScore, scoring, { legacyToefl }) : null;
  return {
    ...report,
    scores,
    totalScore,
    scoring_framework: report.scoring_framework || {
      label: getExamStandard(scoring).label,
      criteria: getExamStandard(scoring).criteria,
      strategy: getExamStandard(scoring).strategy,
      practice_estimate: true,
      descriptor: getScoreDescriptor(totalScore, scoring),
    },
  };
}

export default function VoiceReport() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const storedContext = safeParseObject(sessionStorage.getItem("voiceReportContext")) || {};
  const scenarioId = params.get("scenario") || storedContext.scenario || "";
  const mode = params.get("mode") || storedContext.mode || "basic";
  const dialogMode = params.get("dialogMode") || storedContext.dialogMode || "free_talk";
  const scoring = params.get("scoring") || storedContext.scoring || "daily";
  const duration = parseInt(params.get("duration") || `${storedContext.duration || 0}`, 10);
  const words = parseInt(params.get("words") || `${storedContext.words || 0}`, 10);
  const exchanges = parseInt(params.get("exchanges") || `${storedContext.exchanges || 0}`, 10);

  const scenario = getScenario(scenarioId);
  const [report, setReport] = useState(null);
  const suppliedScores = useRef({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    if (!scenario) {
      navigate("/voice");
    }
  }, [navigate, scenario]);

  useEffect(() => {
    if (scenario) {
      void generateReport();
    }
  }, [scenario]);

  if (!scenario) {
    return null;
  }

  const generateReport = async () => {
    const messages = safeParseMessages(sessionStorage.getItem("voiceMessages"));
    const fallbackReport = generateVoiceReport({
      messages,
      scoring,
      duration,
      words,
      exchanges,
      scenarioTitle: scenario?.title || "Practice Session",
      mode,
      dialogMode,
    });

    try {
      const result = await localApi.integrations.Core.InvokeLLM({
        input: {
          kind: "voice-report",
          messages,
          scoring,
          duration,
          words,
          exchanges,
          scenarioTitle: scenario?.title || "Practice Session",
          mode,
          dialogMode,
        },
      });

      suppliedScores.current = (result || fallbackReport).scores || {};
      setReport(normalizeReport(result || fallbackReport, scoring));
      setReportError("");

      try {
        await localApi.integrations.Core.TrackActivity({
          activity_type: "voice_report_generated",
          scenario: scenarioId,
          mode,
          dialog_mode: dialogMode,
          scoring_standard: scoring,
          duration_seconds: duration,
          words_spoken: words,
          total_exchanges: exchanges,
          report_summary: {
            totalScore: result?.totalScore || null,
            scores: result?.scores || null,
          },
        });
      } catch (trackingError) {
        console.error("Failed to track voice report generation:", trackingError);
      }
    } catch (error) {
      console.error("Failed to generate voice report:", error);
      suppliedScores.current = fallbackReport.scores || {};
      setReport(fallbackReport);
      setReportError(error?.message || "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await localApi.entities.VoiceSession.create({
        scenario: scenarioId,
        mode,
        dialog_mode: dialogMode,
        scoring_standard: scoring,
        messages: safeParseMessages(sessionStorage.getItem("voiceMessages")),
        report,
        duration_seconds: duration,
        words_spoken: words,
        total_exchanges: exchanges,
      });
      setSaved(true);
      toast.success("Report saved successfully!");
    } catch (error) {
      console.error("Failed to save voice report:", error);
      toast.error(error?.message || "Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  const isIelts = scoring === "ielts";
  const isToefl = scoring === "toefl";
  const scoringLabel = (scoring || "daily").toUpperCase();
  const maxScore = scoreMax(scoring);

  // For TOEFL/IELTS/Daily: totalScore should be the average of subscores, not sum
  const computedTotal = report?.scores
    ? (() => {
        const vals = Object.values(report.scores);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return isIelts ? Math.round(avg * 10) / 10 : isToefl ? Math.round(avg * 2) / 2 : Math.round(avg);
      })()
    : report?.totalScore;
  const displayScores = report?.source === 'measured' ? Object.fromEntries(Object.entries(report?.scores || {}).map(([key, value]) => [key, hasReportedScore(suppliedScores.current[key]) ? value : null])) : {};
  const displayedTotal = completeScoreVector(displayScores) ? computedTotal : null;
  const durationStr = `${Math.floor(duration / 60)}m ${duration % 60}s`;

  if (loading) {
    return (
      <LoadingProgressCard
        title="Generating speaking report"
        description="Reviewing the supplied text for practice suggestions."
        durationMs={7200}
        steps={[
          "Reading conversation history",
          "Preparing text-based practice notes",
          "Summarizing feedback",
          "Preparing your report",
        ]}
      />
    );
  }

  return (
    <div className="studio-page studio-page-reading feedback-workbench">
      <p role="note" className="mx-4 mt-4 glass rounded-xl p-3 text-sm text-amber-200">Legacy numeric scores are heuristic, model estimates or simulated values. They are not measured pronunciation, eye contact or verified skill improvement. New Impact feedback uses transcript evidence.</p>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button onClick={() => navigate("/voice")} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div>
          <h2 className="font-semibold text-foreground">Speaking Summary</h2>
          <p className="text-[10px] text-muted-foreground">Practice context: {scoringLabel}</p>
        </div>
      </div>

      <div className="feedback-content">
        <section className="feedback-summary">
          <p className="room-eyebrow">SESSION COMPLETE · {scenario.title}</p>
          <h2>Your next conversation starts here.</h2>
          <p>{report?.suggestions?.[0] || report?.scoring_framework?.descriptor || (hasReportedScore(displayedTotal) ? getScoreDescriptor(displayedTotal, scoring) : "") || 'Review your saved conversation and choose one thing to practise again.'}</p>
          <button type="button" onClick={() => navigate(`/voice/chat?${new URLSearchParams({ scenario: scenarioId, mode, dialogMode, scoring })}`)}>Practise this conversation again →</button>
        </section>
        {reportError && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 border border-amber-400/30">
            <p className="text-sm font-medium text-amber-200">Report generation issue</p>
            <p className="mt-1 text-xs text-amber-100/90 break-words">{reportError}</p>
          </motion.div>
        )}
        {report?.source === 'measured' && <>
        {/* Radar Chart */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-center mb-2">📊 Performance Overview</h3>
          {report?.scores && <RadarChart scores={displayScores} maxScore={maxScore} />}
        </motion.div>

        {/* Total Score */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-2xl p-5 text-center">
          <h3 className="text-sm font-semibold mb-2">📈 Total Score</h3>
          <div className="report-total text-4xl font-bold font-space text-primary">{displayScore(displayedTotal)}</div>
          <p className="text-xs text-muted-foreground mt-1">out of {maxScore}</p>
          <p className="text-[11px] text-primary/80 mt-2">{report?.scoring_framework?.practice_estimate ? "Practice estimate · not an official test score" : `${getExamStandard(scoring).label} practice`}</p>
          {(report?.scoring_framework?.descriptor || (hasReportedScore(displayedTotal) ? getScoreDescriptor(displayedTotal, scoring) : "")) && <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">{report?.scoring_framework?.descriptor || (hasReportedScore(displayedTotal) ? getScoreDescriptor(displayedTotal, scoring) : "")}</p>}
          {report?.scores && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {Object.entries(report.scores).map(([key, val]) => (
                <div key={key} className="glass rounded-xl px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{key}</p>
                  <p className="text-sm font-semibold text-foreground">{displayScore(displayScores[key])}/{maxScore}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        </>}
        {report?.source !== 'measured' && <p className="glass rounded-xl p-4">AI Coaching Suggestion or local text heuristic. No pronunciation, acoustic fluency, exam score or verified speaking improvement was measured.</p>}
        <details className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold">Exam criteria · reference only, no measured score</summary>
          <p className="text-xs text-muted-foreground mt-3">{report?.scoring_framework?.strategy || getExamStandard(scoring).strategy}</p>
          <div className="grid grid-cols-1 gap-2 mt-3">
            {(report?.scoring_framework?.criteria || getExamStandard(scoring).criteria).map(criteria => (
              <div key={criteria.key} className="rounded-xl bg-white/5 px-3 py-2"><p className="text-xs font-medium">{criteria.label}</p><p className="text-[11px] text-muted-foreground mt-1">{criteria.focus}</p></div>
            ))}
          </div>
          {scoring === "toefl" && <p className="text-[11px] text-amber-200/80 mt-3">TOEFL changed to a 1–6 score scale on January 21, 2026. Older 0–30 comparisons may still appear during the transition.</p>}
        </details>

        {/* Detailed Feedback */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="feedback-full glass rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold">Practice suggestions · check against your own words</h3>

          {report?.grammar_analysis?.length > 0 && (
            <FeedbackSection title="Grammar Analysis" items={report.grammar_analysis.map(g => `"${g.error}" → "${g.correction}" (${g.category})`)} />
          )}

          {report?.vocabulary_analysis && (
            <FeedbackSection title="Vocabulary Analysis" items={[
              `Range: ${report.vocabulary_analysis.range}`,
              `Accuracy: ${report.vocabulary_analysis.accuracy}`,
              ...(report.vocabulary_analysis.suggestions || []).map(s => `Suggestion: ${s}`),
            ]} />
          )}

          {report?.source === 'measured' && report?.pronunciation_analysis && (
            <FeedbackSection title="Pronunciation Analysis" items={[
              ...(report.pronunciation_analysis.problem_sounds || []).map(s => `Problem sound: ${s}`),
              `Word stress: ${report.pronunciation_analysis.word_stress}`,
              `Intonation: ${report.pronunciation_analysis.intonation}`,
            ]} />
          )}

          {report?.source === 'measured' && report?.fluency_analysis && (
            <FeedbackSection title="Fluency Analysis" items={[
              `Speech rate: ${report.fluency_analysis.speech_rate}`,
              `Pauses: ${report.fluency_analysis.unnatural_pauses}`,
              `Fillers: ${report.fluency_analysis.fillers}`,
            ]} />
          )}
        </motion.div>

        <details className="glass rounded-2xl p-4"><summary>Conversation and session details</summary>
        {/* Conversation Review */}
        {report?.conversation_review?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold mb-3">📝 Conversation Review</h3>
            <div className="space-y-3">
              {report.conversation_review.map((item, i) => (
                <div key={i} className="feedback-pair glass rounded-xl p-3">
                  <div className="feedback-original"><span>Original</span><p>{item.original}</p></div>
                  <div className="feedback-suggested"><span>Suggested wording</span><p>{item.correction}</p></div>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">📊 {item.category}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Session Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">📊 Session Statistics</h3>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Duration" value={durationStr} />
            <StatBox label="Exchanges" value={exchanges} />
            <StatBox label="Words Spoken" value={words} />
            <StatBox label="Scenario" value={scenario.title} />
          </div>
        </motion.div>

        </details>
        {/* Suggestions */}
        {report?.suggestions?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold mb-3">🎯 Actionable Suggestions</h3>
            <div className="space-y-2">
              {report.suggestions.map((s, i) => (
                <div key={i} className="glass rounded-xl px-3 py-2 flex gap-2">
                  <span className="text-primary font-semibold text-sm">{i + 1}.</span>
                  <p className="text-sm text-muted-foreground">{s}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Save Status */}
        {saved && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-4 border border-success/30 flex items-center gap-2 justify-center">
            <CheckCircle className="w-4 h-4 text-success" />
            <p className="text-sm font-medium text-success">Report Saved Successfully!</p>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="feedback-actions">
          <Button variant="outline" onClick={() => navigate(`/voice/chat?${new URLSearchParams({ scenario: scenarioId, mode, dialogMode, scoring })}`)} className="rounded-2xl border-white/10"><RotateCcw className="w-4 h-4 mr-2" />Retry</Button>
          <Button
            onClick={handleSave}
            disabled={saved || saving}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saved ? "Saved" : "Save Summary"}
          </Button>
          <Button
            onClick={() => navigate("/voice")}
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-white/10 hover:bg-white/5"
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackSection({ title, items }) {
  return (
    <details className="feedback-section">
      <summary>{title}</summary>
      <div className="glass rounded-xl p-3 space-y-1">
        {items.map((item, i) => (
          <p key={i} className="text-xs text-muted-foreground">• {item}</p>
        ))}
      </div>
    </details>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="glass rounded-xl px-3 py-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
