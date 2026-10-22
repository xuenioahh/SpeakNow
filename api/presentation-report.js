import { coachingOnly } from '../src/lib/feedbackEvidence.js';
import { protectedApi } from "./_apiGuard.js";
function fallbackReport({ duration, totalPages, fileName }) {
  const durationStr = `${Math.floor((duration || 0) / 60)}m ${(duration || 0) % 60}s`;
  return {
    source: "fallback",
    overall_score: 7.0,
    scores: {
      content: 7.0,
      delivery: 7.0,
      body_language: 6.8,
      engagement: 7.1,
      document_handling: 7.0,
    },
    time_analysis: {
      total_duration: durationStr,
      avg_per_page: `${Math.floor(((totalPages ? duration / totalPages : duration) || 0) / 60)}m ${Math.round(((totalPages ? duration / totalPages : duration) || 0) % 60)}s`,
      recommendation: "Keep each slide focused on one point, then close with a short takeaway.",
      page_assessments: [],
    },
    feedback: {
      content: {
        strengths: "Your session data was captured, so you can still review your overall flow.",
        improvements: "Make each slide explanation shorter and clearer before moving on.",
      },
      delivery: {
        strengths: "You completed a full practice run.",
        improvements: "Use steadier pacing and clearer transitions between slides.",
      },
    },
    key_takeaways: [
      "You finished the practice session successfully.",
      "A fallback summary is shown because the model response was unavailable.",
      "Focus next on clearer slide-by-slide transitions and shorter takeaways.",
    ],
    suggestions: [
      "State the main idea of each slide first.",
      "Add one example only, then move on.",
      "End with a short final takeaway.",
    ],
    pdf_summary: {
      fileName,
      overlap: 0,
      trackedKeywords: [],
      transcriptKeywords: [],
      coverageLabel: "Unavailable",
    },
  };
}

import { requestStructuredLlm } from "./_llm.js";

function clampPresentationScore(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(10, numeric));
}

function roundScore(value, fallback) {
  const clamped = clampPresentationScore(value, fallback);
  return Number.isFinite(clamped) ? Math.round(clamped * 10) / 10 : fallback;
}

function sanitizeStringList(items, limit) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeScores(scores, fallback) {
  if (!scores || typeof scores !== "object") return fallback;

  return {
    content: roundScore(scores.content, fallback.content),
    delivery: roundScore(scores.delivery, fallback.delivery),
    body_language: roundScore(scores.body_language, fallback.body_language),
    engagement: roundScore(scores.engagement, fallback.engagement),
    document_handling: roundScore(scores.document_handling, fallback.document_handling),
  };
}

function sanitizeTimeAnalysis(timeAnalysis, fallback) {
  if (!timeAnalysis || typeof timeAnalysis !== "object") return fallback;

  const totalDuration = String(timeAnalysis.total_duration || "").trim();
  const avgPerPage = String(timeAnalysis.avg_per_page || "").trim();
  const recommendation = String(timeAnalysis.recommendation || "").trim();
  const pageAssessments = (Array.isArray(timeAnalysis.page_assessments) ? timeAnalysis.page_assessments : [])
    .map((item, index) => {
      const page = Number(item?.page);
      const timeSpent = String(item?.time_spent || "").trim();
      const assessment = String(item?.assessment || "").trim();
      if (!timeSpent || !assessment) return null;
      return {
        page: Number.isFinite(page) ? page : index + 1,
        time_spent: timeSpent,
        assessment,
      };
    })
    .filter(Boolean);

  if (!totalDuration || !avgPerPage || !recommendation) {
    return fallback;
  }

  return {
    total_duration: totalDuration,
    avg_per_page: avgPerPage,
    recommendation,
    page_assessments: pageAssessments,
  };
}

function sanitizeFeedback(feedback, fallback) {
  if (!feedback || typeof feedback !== "object") return fallback;

  const sections = ["content", "delivery"];
  const normalized = {};

  for (const section of sections) {
    const strengths = String(feedback?.[section]?.strengths || "").trim();
    const improvements = String(feedback?.[section]?.improvements || "").trim();
    normalized[section] = {
      strengths: strengths || fallback[section].strengths,
      improvements: improvements || fallback[section].improvements,
    };
  }

  return normalized;
}

function sanitizeReportBasis(reportBasis) {
  if (!reportBasis || typeof reportBasis !== "object") return null;

  const dominantPageType = String(reportBasis.dominant_page_type || "").trim();
  const evidenceTerms = sanitizeStringList(reportBasis.evidence_terms, 6);
  const transcriptSignal = String(reportBasis.transcript_signal || "").trim();

  if (!dominantPageType || !evidenceTerms.length || !transcriptSignal) {
    return null;
  }

  return {
    dominant_page_type: dominantPageType,
    evidence_terms: evidenceTerms,
    transcript_signal: transcriptSignal,
  };
}

function sanitizePdfSummary(pdfSummary, fallback) {
  if (!pdfSummary || typeof pdfSummary !== "object") return fallback;

  return {
    fileName: String(pdfSummary.fileName || "").trim() || fallback.fileName,
    overlap: Number.isFinite(Number(pdfSummary.overlap)) ? Number(pdfSummary.overlap) : fallback.overlap,
    trackedKeywords: sanitizeStringList(pdfSummary.trackedKeywords, 8),
    transcriptKeywords: sanitizeStringList(pdfSummary.transcriptKeywords, 8),
    coverageLabel: String(pdfSummary.coverageLabel || "").trim() || fallback.coverageLabel,
  };
}

function normalizeReportShape(parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return { ...fallback, source: "fallback" };

  const reportBasis = sanitizeReportBasis(parsed.report_basis || {
    dominant_page_type: parsed.dominant_page_type,
    evidence_terms: parsed.evidence_terms,
    transcript_signal: parsed.transcript_signal,
  });
  const keyTakeaways = sanitizeStringList(parsed.key_takeaways, 3);
  const suggestions = sanitizeStringList(parsed.suggestions, 3);

  if (!reportBasis || !keyTakeaways.length || !suggestions.length) {
    return { ...fallback, source: "fallback" };
  }

  const recommendation = String(parsed.recommendation || "").trim();
  const scores = sanitizeScores(parsed.scores, fallback.scores);
  const feedback = sanitizeFeedback(parsed.feedback, fallback.feedback);
  const timeAnalysis = sanitizeTimeAnalysis(
    parsed.time_analysis || {
      total_duration: fallback.time_analysis.total_duration,
      avg_per_page: fallback.time_analysis.avg_per_page,
      recommendation: recommendation || fallback.time_analysis.recommendation,
      page_assessments: [],
    },
    fallback.time_analysis
  );
  const pdfSummary = sanitizePdfSummary(
    parsed.pdf_summary || {
      fileName: fallback.pdf_summary.fileName,
      overlap: fallback.pdf_summary.overlap,
      trackedKeywords: reportBasis.evidence_terms,
      transcriptKeywords: reportBasis.evidence_terms.slice(0, 3),
      coverageLabel: fallback.pdf_summary.coverageLabel,
    },
    fallback.pdf_summary
  );

  return {
    source: "ai",
    overall_score: roundScore(parsed.overall_score, fallback.overall_score),
    scores,
    time_analysis: timeAnalysis,
    feedback,
    report_basis: reportBasis,
    key_takeaways: keyTakeaways,
    suggestions,
    pdf_summary: pdfSummary,
  };
}

function buildFastReportPayload(payload) {
  const pageTexts = Array.isArray(payload?.pageTexts) ? payload.pageTexts : [];
  const pagePreview = pageTexts
    .slice(0, 3)
    .map((text, index) => `P${index + 1}: ${String(text || "").replace(/\s+/g, " ").slice(0, 100)}`)
    .join("\n");
  const transcriptPreview = String(payload?.transcript || "").replace(/\s+/g, " ").slice(0, 220);
  const pageTimingPreview = JSON.stringify((payload?.pageTimings || []).slice(0, 5));

  return [
    `File: ${payload?.fileName || "presentation"}`,
    `Duration: ${payload?.duration || 0}s`,
    `Total pages: ${payload?.totalPages || 1}`,
    `Page timings: ${pageTimingPreview}`,
    `Transcript: ${transcriptPreview || "(empty)"}`,
    `Page previews:\n${pagePreview || "(none)"}`,
  ].join("\n");
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body || {};
  const fallback = fallbackReport(payload);

  try {
    const { provider, model, parsed } = await requestStructuredLlm({
      schemaName: "presentation_report",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          dominant_page_type: { type: "string" },
          evidence_terms: { type: "array", items: { type: "string" } },
          transcript_signal: { type: "string" },
          recommendation: { type: "string" },
          key_takeaways: { type: "array", items: { type: "string" } },
          suggestions: { type: "array", items: { type: "string" } },
        },
        required: ["dominant_page_type", "evidence_terms", "transcript_signal", "recommendation", "key_takeaways", "suggestions"],
      },
      timeoutMs: 12000,
      retryOnce: true,
      systemText: "You are a presentation coach. Return strict JSON only. Keep fields short. Required keys only: dominant_page_type, evidence_terms, transcript_signal, recommendation, key_takeaways, suggestions. Reuse concrete words from the transcript or page previews. Avoid generic praise. This is an AI Coaching Suggestion on text, not measurement: do not assess pronunciation, acoustic fluency, body language, confidence or learning improvement.",
      userText: buildFastReportPayload(payload),
    });
    const normalized = normalizeReportShape(parsed, fallback);
    res.status(200).json(
      coachingOnly(normalized.source === "ai" ? { ...normalized, provider, model } : normalized)
    );
  } catch (error) {
    console.error("presentation-report api error:", error);
    res.status(200).json(coachingOnly({ ...fallback, fallback_reason: error?.message || "request_failed" }));
  }
}

export default protectedApi(handler, { ai: true });
