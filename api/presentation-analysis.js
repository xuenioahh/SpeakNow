import { protectedApi } from "./_apiGuard.js";
function fallbackAnalysis(fileName, pageTexts) {
  const totalPages = Math.max((pageTexts || []).length, 1);
  return {
    source: "fallback",
    title: fileName || "Presentation File",
    overviewCards: [
      { value: `${totalPages} ${totalPages === 1 ? "page" : "pages"}` },
      { value: "Frame the topic clearly" },
      { value: "Match your wording to each page type" },
    ],
    structureCards: [
      {
        step: "Opening",
        title: "State the topic and the goal",
        body: "Start by telling the audience what this presentation is about and what they should pay attention to.",
      },
      {
        step: "Middle",
        title: "Explain the strongest pages only",
        body: "Choose the pages with the most useful content and explain them in your own words instead of reading everything.",
      },
      {
        step: "Closing",
        title: "Finish with the result",
        body: "End by restating the main conclusion or action in one sentence.",
      },
    ],
    focusCards: [
      { title: "Priority words", items: ["topic", "evidence", "result"] },
    ],
    presenterTips: [
      "Open with the topic in one sentence.",
      "Say the key term first, then explain it.",
      "Finish with one result or takeaway.",
    ],
  };
}

import { requestStructuredLlm } from "./_llm.js";

function toNonEmptyString(value, fallback = "") {
  const safe = String(value || "").trim();
  return safe || fallback;
}

function sanitizeStringList(items, limit) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeValueCards(items, fallback) {
  const cards = (Array.isArray(items) ? items : [])
    .map((item) => {
      const value = String(item?.value || "").trim();
      return value ? { value } : null;
    })
    .filter(Boolean)
    .slice(0, 3);

  return cards.length ? cards : fallback;
}

function sanitizeStructureCards(items, fallback) {
  const cards = (Array.isArray(items) ? items : [])
    .map((item) => {
      const step = String(item?.step || "").trim();
      const title = String(item?.title || "").trim();
      const body = String(item?.body || "").trim();
      return step && title && body ? { step, title, body } : null;
    })
    .filter(Boolean)
    .slice(0, 3);

  return cards.length ? cards : fallback;
}

function sanitizeFocusCards(items, fallback) {
  const cards = (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = String(item?.title || "").trim();
      const nextItems = sanitizeStringList(item?.items, 4);
      return title && nextItems.length ? { title, items: nextItems } : null;
    })
    .filter(Boolean)
    .slice(0, 1);

  return cards.length ? cards : fallback;
}

function sanitizeDocumentBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== "object") return null;

  const mainTopic = String(blueprint.mainTopic || "").trim();
  const audienceGoal = String(blueprint.audienceGoal || "").trim();
  const finalTakeaway = String(blueprint.finalTakeaway || "").trim();
  const sectionLabels = sanitizeStringList(blueprint.sectionLabels, 4);

  if (!mainTopic || !audienceGoal || !finalTakeaway || !sectionLabels.length) {
    return null;
  }

  return {
    mainTopic,
    audienceGoal,
    finalTakeaway,
    sectionLabels,
  };
}

function buildCompactPagePreview(pageTexts) {
  return (Array.isArray(pageTexts) ? pageTexts : [])
    .slice(0, 3)
    .map((text, index) => `P${index + 1}: ${String(text || "").replace(/\s+/g, " ").slice(0, 120)}`)
    .join("\n");
}

function normalizeAnalysisShape(parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return fallback;

  const compactOverview = sanitizeStringList(parsed.overview, 3);
  const compactStages = sanitizeStringList(parsed.stages, 3);
  const compactTerms = sanitizeStringList(parsed.focusTerms, 4);
  const presenterTips = sanitizeStringList(parsed.presenterTips, 3);
  const documentBlueprint = sanitizeDocumentBlueprint(parsed.documentBlueprint);
  const summary = String(parsed.summary || "").trim();
  const title = toNonEmptyString(parsed.title, fallback.title);
  const overviewCards = compactOverview.length
    ? compactOverview.map((value) => ({ value }))
    : sanitizeValueCards(parsed.overviewCards, fallback.overviewCards);
  const structureCards = compactStages.length === 3
    ? compactStages.map((body, index) => ({
        step: fallback.structureCards[index]?.step || `Step ${index + 1}`,
        title: fallback.structureCards[index]?.title || `Stage ${index + 1}`,
        body,
      }))
    : sanitizeStructureCards(parsed.structureCards, fallback.structureCards);
  const focusCards = compactTerms.length
    ? [{ title: "Priority words", items: compactTerms }]
    : sanitizeFocusCards(parsed.focusCards, fallback.focusCards);
  const hasAiSpecificContent = Boolean(summary || documentBlueprint || presenterTips.length || compactOverview.length);

  if (!hasAiSpecificContent) {
    return fallback;
  }

  return {
    source: "ai",
    title,
    summary,
    documentBlueprint,
    overviewCards,
    structureCards,
    focusCards,
    presenterTips: presenterTips.length ? presenterTips : fallback.presenterTips,
  };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { fileName, pageTexts } = req.body || {};

  try {
    const fallback = fallbackAnalysis(fileName, pageTexts);
    const { provider, model, parsed } = await requestStructuredLlm({
      schemaName: "presentation_analysis",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          overview: { type: "array", items: { type: "string" } },
          stages: { type: "array", items: { type: "string" } },
          focusTerms: { type: "array", items: { type: "string" } },
          documentBlueprint: {
            type: "object",
            additionalProperties: false,
            properties: {
              mainTopic: { type: "string" },
              sectionLabels: { type: "array", items: { type: "string" } },
              audienceGoal: { type: "string" },
              finalTakeaway: { type: "string" },
            },
            required: ["mainTopic", "sectionLabels", "audienceGoal", "finalTakeaway"],
          },
          presenterTips: { type: "array", items: { type: "string" } },
        },
        required: ["title", "summary", "overview", "stages", "focusTerms", "presenterTips"],
      },
      timeoutMs: 9000,
      retryOnce: true,
      systemText: "You are a presentation coach. Return strict JSON only. Keep every field short. Required: title, summary, overview[3], stages[3], focusTerms[3-4], presenterTips[3]. Optional: documentBlueprint. Reuse actual words from the file. Make stages clearly opening, middle, and closing guidance.",
      userText: `File: ${fileName || "presentation"}\nPage preview:\n${buildCompactPagePreview(pageTexts)}`,
    });
    res.status(200).json({ ...normalizeAnalysisShape(parsed, fallback), provider, model });
  } catch (error) {
    console.error("presentation-analysis api error:", error);
    res.status(200).json({
      ...fallbackAnalysis(fileName, pageTexts),
      fallback_reason: error?.message || "request_failed",
    });
  }
}

export default protectedApi(handler, { ai: true });
