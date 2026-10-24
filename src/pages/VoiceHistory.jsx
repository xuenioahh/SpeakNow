import { useSessionHistory } from '@/hooks/useSessionHistory';
import { hasReportedScore, displayScore, completeScoreVector, displayRecordDate, displayDuration } from '@/lib/reportDisplay';
import PracticeTimeline from '@/components/report/PracticeTimeline';
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, ChevronUp, Mic, Trash2, Calendar, Clock } from "lucide-react";
import { localApi } from "@/api/localClient";
import { getScenario } from "@/lib/scenarios";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import RadarChart from "@/components/report/RadarChart";
import { buildVoiceHistorySummary } from "@/lib/profileInsights";
import { scoreMax } from "@/lib/examStandards";

export default function VoiceHistory() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessions, setSessions, loading, loadError, loadSessions } = useSessionHistory(localApi.entities.VoiceSession);
  const [expanded, setExpanded] = useState(null);
  const openedLink = useRef("");
  const deleting = useRef(new Set());
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('session');
    const linkKey = `${location.key}:${id}`;
    if (id && openedLink.current !== linkKey && sessions.some(session => session.id === id)) {
      openedLink.current = linkKey;
      setExpanded(id);
      const frame = requestAnimationFrame(() => document.getElementById(`saved-session-${id}`)?.scrollIntoView({ behavior: 'auto', block: 'start' }));
      return () => cancelAnimationFrame(frame);
    }
  }, [location.key, location.search, sessions]);
  const historySummary = buildVoiceHistorySummary(sessions.filter(session => session.report?.source === 'measured'));

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (deleting.current.has(id)) return;
    deleting.current.add(id);
    try {
      await localApi.entities.VoiceSession.delete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success("Session deleted");
    } catch { toast.error("Session could not be deleted. Your records are kept; try again."); }
    finally { deleting.current.delete(id); }
  };

  const formatDate = displayRecordDate;

  const formatDuration = displayDuration;

  const getScoringColor = (scoring) => {
    if (scoring === "ielts") return "text-blue-400 bg-blue-400/10";
    if (scoring === "toefl") return "text-emerald-400 bg-emerald-400/10";
    return "text-amber-400 bg-amber-400/10";
  };

  return (
    <div className="studio-page studio-page-reading history-page">
      <p role="note" className="mx-4 mt-4 glass rounded-xl p-3 text-sm text-amber-200">Legacy numeric scores are heuristic, model estimates or simulated values. They are not measured pronunciation, eye contact or verified skill improvement. New Impact feedback uses transcript evidence.</p>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button aria-label="Back to practice" onClick={() => navigate("/voice")} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground">Voice History</h1>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{sessions.length} sessions</span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loadError && <div role="alert" className="glass rounded-2xl p-4"><p className="text-sm text-muted-foreground">{loadError}</p><button type="button" onClick={loadSessions} disabled={loading} className="history-retry">Try loading again</button></div>}
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : loadError && sessions.length === 0 ? null : sessions.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 space-y-3">
            <Mic className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No saved sessions yet</p>
            <p className="text-xs text-muted-foreground/60">Complete a voice session and save the report to see it here</p>
            <Button onClick={() => navigate("/voice")} size="sm" className="mt-2 bg-gradient-to-r from-violet-500 to-indigo-600">
              Start Practicing
            </Button>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Overall Evaluation</h3>
                  <p className="text-xs text-muted-foreground mt-1">Cross-session speaking trends from your saved history.</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{historySummary.averageTotal}</p>
                  <p className="text-[10px] text-muted-foreground">avg total</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="glass rounded-xl px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Best metric</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{historySummary.bestMetric}</p>
                </div>
                <div className="glass rounded-xl px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Weakest metric</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{historySummary.weakestMetric}</p>
                </div>
              </div>

              {historySummary.latestReviews.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Recent Review Highlights</p>
                  <div className="space-y-2">
                    {historySummary.latestReviews.map((item, index) => (
                      <div key={`${item.original}-${index}`} className="glass rounded-xl px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">You: "{item.original}"</p>
                        <p className="text-[10px] text-success mt-1">Improve: {item.correction}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {historySummary.latestSuggestions.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Priority Suggestions</p>
                  <div className="space-y-1.5">
                    {historySummary.latestSuggestions.map((item) => (
                      <div key={item} className="glass rounded-xl px-3 py-2">
                        <p className="text-xs text-muted-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            <section className="glass rounded-2xl p-4"><p className="room-eyebrow mb-4">YOUR PRACTICE JOURNEY</p><PracticeTimeline sessions={sessions} onSelect={id => { setExpanded(id); document.getElementById(`saved-session-${id}`)?.scrollIntoView({ behavior: 'auto', block: 'start' }); }} /></section>
            {sessions.map((session, i) => {
            const scenario = getScenario(session.scenario);
            const isOpen = expanded === session.id;
            const report = session.report;
            const isIelts = session.scoring_standard === "ielts";
            const isToefl = session.scoring_standard === "toefl";
            const legacyToefl = isToefl && !report?.scoring_framework && Object.values(report?.scores || {}).some(value => Number(value) > 6);
            const maxScore = legacyToefl ? 30 : scoreMax(session.scoring_standard);

            // Compute total from subscores average
            const computedTotal = report?.scores
              ? (() => {
                  const vals = Object.values(report.scores);
                  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                  return isIelts ? Math.round(avg * 10) / 10 : isToefl ? Math.round(avg * 2) / 2 : Math.round(avg);
                })()
              : report?.totalScore;

            const totalAvailable = report?.scores ? completeScoreVector(report.scores) : hasReportedScore(report?.totalScore);
            return (
              <motion.div
                id={`saved-session-${session.id}`}
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.15), duration: 0.25 }}
                className="history-record glass rounded-2xl overflow-hidden"
              >
                {/* Card Header */}
                <button
                  aria-expanded={isOpen}
                  aria-controls={`saved-session-detail-${session.id}`}
                  onClick={() => session.report?.learning ? navigate(`/practice/review?id=${session.id}`) : setExpanded(isOpen ? null : session.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{session.report?.learning?.title || scenario?.title || session.scenario}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getScoringColor(session.scoring_standard)}`}>
                        {session.scoring_standard?.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDate(session.created_date)}
                      </span>
                      {session.duration_seconds && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(session.duration_seconds)}
                        </span>
                      )}
                    </div>
                  </div>
                  {computedTotal != null && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-primary">{displayScore(totalAvailable ? computedTotal : null)}</p>
                      <p className="text-[9px] text-muted-foreground">/{maxScore}{legacyToefl ? " legacy" : ""}</p>
                    </div>
                  )}
                  <div className="ml-2">
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded Full Report */}
                <AnimatePresence>
                  {isOpen && report && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      id={`saved-session-detail-${session.id}`}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden border-t border-white/5"
                    >
                      <div className="p-4 space-y-4">
                        {/* Radar Chart */}
                        {report.scores && (
                          <div className="glass rounded-2xl p-3">
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 text-center uppercase">📊 Performance Overview</p>
                            <RadarChart scores={report.scores} maxScore={maxScore} history={sessions.filter(item => item.scoring_standard === session.scoring_standard && (item.scoring_standard !== "toefl" || (Object.values(item.report?.scores || {}).some(value => Number(value) > 6) === legacyToefl)))} />
                          </div>
                        )}

                        {/* Score Breakdown */}
                        {report.scores && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Score Breakdown</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(report.scores).map(([key, val]) => (
                                <div key={key} className="glass rounded-xl px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">{key}</p>
                                  <p className="text-sm font-semibold text-foreground">{displayScore(val)}/{maxScore}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Grammar Analysis */}
                        {report.grammar_analysis?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Grammar Analysis</p>
                            <div className="glass rounded-xl p-3 space-y-2">
                              {report.grammar_analysis.map((g, idx) => (
                                <div key={idx} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                                  <p className="text-[10px] text-accent">✗ {g.error}</p>
                                  <p className="text-[10px] text-success">✓ {g.correction}</p>
                                  <p className="text-[10px] text-muted-foreground/60">📊 {g.category}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Vocabulary Analysis */}
                        {report.vocabulary_analysis && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Vocabulary Analysis</p>
                            <div className="glass rounded-xl p-3 space-y-1">
                              <p className="text-[10px] text-muted-foreground">• Range: {report.vocabulary_analysis.range}</p>
                              <p className="text-[10px] text-muted-foreground">• Accuracy: {report.vocabulary_analysis.accuracy}</p>
                              {report.vocabulary_analysis.suggestions?.map((s, idx) => (
                                <p key={idx} className="text-[10px] text-primary">💡 {s}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pronunciation Analysis */}
                        {report.pronunciation_analysis && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Pronunciation Analysis</p>
                            <div className="glass rounded-xl p-3 space-y-1">
                              {report.pronunciation_analysis.problem_sounds?.map((s, idx) => (
                                <p key={idx} className="text-[10px] text-accent">⚠ Problem sound: {s}</p>
                              ))}
                              <p className="text-[10px] text-muted-foreground">• Word stress: {report.pronunciation_analysis.word_stress}</p>
                              <p className="text-[10px] text-muted-foreground">• Intonation: {report.pronunciation_analysis.intonation}</p>
                            </div>
                          </div>
                        )}

                        {/* Fluency Analysis */}
                        {report.fluency_analysis && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Fluency Analysis</p>
                            <div className="glass rounded-xl p-3 space-y-1">
                              <p className="text-[10px] text-muted-foreground">• Speech rate: {report.fluency_analysis.speech_rate}</p>
                              <p className="text-[10px] text-muted-foreground">• Pauses: {report.fluency_analysis.unnatural_pauses}</p>
                              <p className="text-[10px] text-muted-foreground">• Fillers: {report.fluency_analysis.fillers}</p>
                            </div>
                          </div>
                        )}

                        {/* Conversation Review */}
                        {report.conversation_review?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Conversation Review</p>
                            <div className="space-y-2">
                              {report.conversation_review.map((item, idx) => (
                                <div key={idx} className="glass rounded-xl p-3">
                                  <p className="text-[10px] text-muted-foreground">You: "{item.original}"</p>
                                  <p className="text-[10px] text-success mt-1">✓ {item.correction}</p>
                                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">📊 {item.category}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggestions */}
                        {report.suggestions?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">🎯 Actionable Suggestions</p>
                            <div className="space-y-1.5">
                              {report.suggestions.map((s, idx) => (
                                <div key={idx} className="flex gap-2 glass rounded-xl px-3 py-2">
                                  <span className="text-primary text-xs font-bold">{idx + 1}.</span>
                                  <p className="text-xs text-muted-foreground">{s}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Session Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="glass rounded-xl px-2 py-2 text-center">
                            <p className="text-[9px] text-muted-foreground">Words</p>
                            <p className="text-xs font-semibold text-foreground">{session.words_spoken || "-"}</p>
                          </div>
                          <div className="glass rounded-xl px-2 py-2 text-center">
                            <p className="text-[9px] text-muted-foreground">Exchanges</p>
                            <p className="text-xs font-semibold text-foreground">{session.total_exchanges || "-"}</p>
                          </div>
                          <div className="glass rounded-xl px-2 py-2 text-center">
                            <p className="text-[9px] text-muted-foreground">Mode</p>
                            <p className="text-xs font-semibold text-foreground capitalize">{session.mode || "-"}</p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete this session
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
