import { coachingOnly } from '../src/lib/feedbackEvidence.js';
import { protectedApi } from "./_apiGuard.js";
import { generatePresentationPauseFeedback } from "../src/lib/localReports.js";
import { requestStructuredLlm } from "./_llm.js";

function sanitizeStringList(items, limit) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizePriorityCards(items, fallback) {
  const cards = (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = String(item?.title || "").trim();
      const body = String(item?.body || "").trim();
      const score = Number(item?.score);
      return title && body && Number.isFinite(score)
        ? { title, body, score: Math.round(score * 10) / 10 }
        : null;
    })
    .filter(Boolean)
    .slice(0, 2);

  return cards.length === 2 ? cards : fallback.priorityCards;
}

function normalizeFeedback(parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return fallback;

  const nextStep = String(parsed.nextStep || "").trim();
  const evidenceLine = String(parsed.evidenceLine || "").trim();
  const strengths = sanitizeStringList(parsed.strengths, 3);
  const improvements = sanitizeStringList(parsed.improvements, 3);
  const overallScore = Number(parsed.overallScore);

  if (!nextStep) {
    return fallback;
  }

  const safeOverallScore = Number.isFinite(overallScore) ? Math.round(overallScore * 10) / 10 : fallback.overallScore;
  const safeEvidenceLine = evidenceLine || nextStep;
  const priorityCards = Array.isArray(parsed.priorityCards) && parsed.priorityCards.length
    ? sanitizePriorityCards(parsed.priorityCards, fallback)
    : [
        {
          title: "What this page is saying",
          score: 90,
          body: nextStep,
        },
        {
          title: "Fix this first",
          score: safeOverallScore,
          body: improvements[0] || fallback.priorityCards?.[1]?.body || nextStep,
        },
      ];

  return {
    ...fallback,
    source: "ai",
    title: String(parsed.title || "").trim() || fallback.title,
    elapsedLabel: String(parsed.elapsedLabel || "").trim() || fallback.elapsedLabel,
    overallScore: safeOverallScore,
    transcriptPreview: String(parsed.transcriptPreview || "").trim() || fallback.transcriptPreview,
    pageContentPreview: String(parsed.pageContentPreview || "").trim() || fallback.pageContentPreview,
    nextStep,
    strengths: strengths.length ? strengths : fallback.strengths,
    improvements: improvements.length ? improvements : fallback.improvements,
    pageType: String(parsed.pageType || "").trim() || fallback.pageType,
    evidenceLine: safeEvidenceLine,
    priorityCards,
  };
}

function buildCompactPausePrompt(payload) {
  const currentPageText = String(payload.currentPageText || "").replace(/\s+/g, " ").slice(0, 220);
  const transcript = String(payload.transcript || "").replace(/\s+/g, " ").slice(0, 120);
  const scorePairs = Object.entries(payload.scores || {})
    .slice(0, 3)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");

  return [
    `Page:${payload.page || 1}`,
    `Elapsed:${payload.elapsed || 0}`,
    `Text:${currentPageText || "(none)"}`,
    `Speech:${transcript || "(empty)"}`,
    `Scores:${scorePairs || "(none)"}`,
  ].join("\n");
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body || {};
  const fallback = generatePresentationPauseFeedback(payload);
  fallback.source = "fallback";

  try {
    const { provider, model, parsed } = await requestStructuredLlm({
      schemaName: "presentation_pause_feedback",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          elapsedLabel: { type: "string" },
          nextStep: { type: "string" },
          evidenceLine: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
        },
        required: ["title", "elapsedLabel", "nextStep", "evidenceLine", "strengths", "improvements"],
      },
      timeoutMs: 7600,
      retryOnce: true,
      systemText: "You are a live presentation coach. Return strict JSON only. Keep every field short. Reuse one concrete word from the slide text or transcript in nextStep or evidenceLine. nextStep must be one sentence the speaker can say now. Label this as an AI Coaching Suggestion; do not infer pronunciation, acoustic fluency, body language, confidence or improvement from text.",
      userText: buildCompactPausePrompt(payload),
    });
    const normalized = normalizeFeedback(parsed, fallback);
    res.status(200).json(coachingOnly({ ...normalized, provider, model }));
  } catch (error) {
    console.error("presentation-pause-feedback api error:", error);
    res.status(200).json(coachingOnly({ ...fallback, fallback_reason: error?.message || "request_failed" }));
  }
}

export default protectedApi(handler, { ai: true });
