import { useSessionHistory } from '@/hooks/useSessionHistory';
import { hasReportedScore, displayScore, completeScoreVector, displayRecordDate, displayDuration } from '@/lib/reportDisplay';
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, ChevronUp, Monitor, Trash2, Calendar, Clock, FileText, ExternalLink } from "lucide-react";
import { localApi } from "@/api/localClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

const TED_TALKS = [
  {
    title: "How to speak so that people want to listen",
    author: "Julian Treasure",
    duration: "9:58",
    url: "https://www.ted.com/talks/julian_treasure_how_to_speak_so_that_people_want_to_listen",
    thumbnail: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400&q=80",
  },
  {
    title: "The secret structure of great talks",
    author: "Nancy Duarte",
    duration: "17:52",
    url: "https://www.ted.com/talks/nancy_duarte_the_secret_structure_of_great_talks",
    thumbnail: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400&q=80",
  },
];

function clampPresentationScore(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(10, numeric));
}

function resolveOverallScore(report) {
  if (report?.source !== 'measured') return null;
  const direct = clampPresentationScore(report?.overall_score);
  if (Number.isFinite(direct)) {
    return Math.round(direct * 10) / 10;
  }

  const values = Object.values(report?.scores || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export default function PresentationHistory() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessions, setSessions, loading, loadError, loadSessions } = useSessionHistory(localApi.entities.PresentationSession);
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

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (deleting.current.has(id)) return;
    deleting.current.add(id);
    try {
      await localApi.entities.PresentationSession.delete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success("Session deleted");
    } catch { toast.error("Session could not be deleted. Your records are kept; try again."); }
    finally { deleting.current.delete(id); }
  };

  const formatDate = displayRecordDate;

  const formatDuration = displayDuration;

  const scoreColor = (v) => v >= 8 ? "text-emerald-400" : v >= 6 ? "text-amber-400" : "text-accent";

  return (
    <div className="studio-page studio-page-reading history-page">
      <p role="note" className="mx-4 mt-4 glass rounded-xl p-3 text-sm text-amber-200">Legacy numeric scores are heuristic, model estimates or simulated values. They are not measured pronunciation, eye contact or verified skill improvement. New Impact feedback uses transcript evidence.</p>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button aria-label="Back to practice" onClick={() => navigate("/presentation")} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-amber-400" />
          <h1 className="font-semibold text-foreground">Your presentation attempts</h1>
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
            <Monitor className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No saved presentations yet</p>
            <p className="text-xs text-muted-foreground/60">Complete a presentation and save the report to see it here</p>
            <Button onClick={() => navigate("/presentation")} size="sm" className="mt-2 bg-gradient-to-r from-amber-500 to-orange-600">
              Start Presenting
            </Button>
          </motion.div>
        ) : (
          sessions.map((session, i) => {
            const isOpen = expanded === session.id;
            const report = session.report;
            const totalAvailable = Object.prototype.hasOwnProperty.call(report || {}, 'overall_score') ? hasReportedScore(report.overall_score) : completeScoreVector(report?.scores);
            const overallScore = totalAvailable ? resolveOverallScore(report) : null;

            return (
              <motion.div
                id={`saved-session-${session.id}`}
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.15), duration: 0.25 }}
                className="history-record glass rounded-2xl overflow-hidden"
              >
                {report?.impact && <div className="p-4 border-b border-white/10"><Button variant="outline" onClick={() => navigate(`/presentation/report?session=${session.id}`)}>Open Impact Report</Button><span className="ml-3 text-xs text-muted-foreground">{report.impact.kind === 'moment' ? 'Targeted retry' : 'Presentation'} · {report.impact.context.targetAudience}</span></div>}
                {/* Card Header */}
                <button
                  aria-expanded={isOpen}
                  aria-controls={`saved-session-detail-${session.id}`}
                  onClick={() => setExpanded(isOpen ? null : session.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="history-record-title text-sm font-semibold text-foreground">{session.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDate(session.created_date)}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(session.duration_seconds)}
                      </span>
                      {session.total_pages && (
                        <span className="text-[10px] text-muted-foreground">{session.total_pages} slides</span>
                      )}
                    </div>
                  </div>
                  {overallScore != null && (
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-bold ${scoreColor(overallScore)}`}>{overallScore}</p>
                      <p className="text-[9px] text-muted-foreground">/10</p>
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
                        {/* Overall Score */}
                        <div className="glass rounded-2xl p-4 text-center">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">⭐ Overall Score</p>
                          <div className={`text-4xl font-bold font-space ${scoreColor(overallScore ?? 0)}`}>{overallScore ?? "-"}</div>
                          <p className="text-[10px] text-muted-foreground">out of 10</p>
                        </div>

                        {/* Score Bars */}
                        {report.scores && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">📈 Score Breakdown</p>
                            <div className="space-y-2">
                              {Object.entries(report.scores).map(([key, val]) => (
                                <div key={key} className="report-score-row">
                                  <span className="text-[10px] text-muted-foreground capitalize report-score-label">{key.replace(/_/g, " ")}</span>
                                  <div className="report-score-meter h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                                      hidden={!hasReportedScore(val)}
                                      style={{ width: hasReportedScore(val) ? `${val * 10}%` : undefined }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-semibold text-foreground report-score-number">{displayScore(val)}/10</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Time Analysis */}
                        {report.time_analysis && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">⏱️ Time Analysis</p>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="glass rounded-xl px-3 py-2 text-center">
                                <p className="text-[9px] text-muted-foreground">Total Duration</p>
                                <p className="text-xs font-semibold text-foreground">{formatDuration(session.duration_seconds)}</p>
                              </div>
                              <div className="glass rounded-xl px-3 py-2 text-center">
                                <p className="text-[9px] text-muted-foreground">Avg per Slide</p>
                                <p className="text-xs font-semibold text-foreground">{report.time_analysis.avg_per_page || "-"}</p>
                              </div>
                            </div>
                            {report.time_analysis.page_assessments?.length > 0 && (
                              <div className="space-y-1">
                                {report.time_analysis.page_assessments.map((p, idx) => (
                                  <div key={idx} className="glass rounded-xl px-3 py-2 flex justify-between items-center">
                                    <span className="text-[10px] text-muted-foreground">Slide {p.page}</span>
                                    <span className="text-[10px] text-foreground">{p.time_spent}</span>
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                                      p.assessment?.toLowerCase().includes("good") ? "bg-success/20 text-success" :
                                      p.assessment?.toLowerCase().includes("long") ? "bg-accent/20 text-accent" :
                                      "bg-amber-500/20 text-amber-400"
                                    }`}>
                                      {p.assessment}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {report.time_analysis.recommendation && (
                              <p className="text-[10px] text-muted-foreground mt-2 italic">{report.time_analysis.recommendation}</p>
                            )}
                          </div>
                        )}

                        {/* Feedback */}
                        {report.feedback && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">🔍 Feedback</p>
                            <div className="space-y-2">
                              {Object.entries(report.feedback).map(([key, val]) => val && (
                                <div key={key} className="glass rounded-xl p-3">
                                  <p className="text-[10px] font-medium text-foreground mb-1 capitalize">
                                    【{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}】
                                  </p>
                                  {val.strengths && <p className="text-[10px] text-muted-foreground">✅ {val.strengths}</p>}
                                  {val.improvements && <p className="text-[10px] text-amber-400 mt-1">💡 {val.improvements}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggestions */}
                        {report.suggestions?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">🎯 Action Plan</p>
                            <div className="space-y-1.5">
                              {report.suggestions.map((s, idx) => (
                                <div key={idx} className="flex gap-2 glass rounded-xl px-3 py-2">
                                  <span className="text-amber-400 text-xs font-bold">{idx + 1}.</span>
                                  <p className="text-xs text-muted-foreground">{s}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* TED Talks */}
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">📺 Recommended Talks</p>
                          <div className="grid grid-cols-2 gap-2">
                            {TED_TALKS.map((talk, idx) => (
                              <a
                                key={idx}
                                href={talk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="glass glass-hover rounded-xl overflow-hidden group block"
                              >
                                <div className="aspect-video overflow-hidden">
                                  <img src={talk.thumbnail} alt={talk.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                </div>
                                <div className="p-2">
                                  <p className="text-[10px] font-medium text-foreground leading-tight line-clamp-2">{talk.title}</p>
                                  <p className="text-[9px] text-muted-foreground mt-0.5">{talk.author}</p>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-[9px] text-muted-foreground">⏱️ {talk.duration}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-primary" />
                                  </div>
                                </div>
                              </a>
                            ))}
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
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
