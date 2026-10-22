import { protectedApi } from "./_apiGuard.js";
import { requestStructuredLlm } from "./_llm.js";
import { cafeConversationHistory, cafeDialogueGuide, cafeLocalPractice } from './_cafeDialogue.js';

function buildSystemPrompt({ scenario, scenarioData, mode, scoring, isGoalOriented, sceneCueId }) {
  const role = scenario?.aiRole || "conversation partner";
  const title = scenario?.title || "General English Practice";
  const userRole = scenarioData?.userRole || "learner";
  const objective = isGoalOriented
    ? `Goal: ${scenarioData?.goal || "Help the user complete the task clearly."}`
    : `Topic: ${scenarioData?.topic || title}`;
  const scoringGuide = scoring === "ielts"
    ? "IELTS practice: assess the four equally weighted criteria—Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation. Prompt a direct answer plus a reason/example; do not claim an official band from one reply."
    : scoring === "toefl"
      ? "Current TOEFL iBT practice: use the 1–6 section scale and focus on delivery/intelligibility, language use, and topic development. Ask for one main point and relevant detail; do not use the retired 0–30 display as the primary score."
      : "Keep it practical and natural.";
  const difficultyGuide = mode === "advanced"
    ? "Use natural richer English."
    : "Use clear easy English.";
  const dialogGuide = isGoalOriented
    ? "Stay on task and ask only for missing details."
    : "Stay in role and ask one useful follow-up.";

  return [
    `Role: ${role}. Scenario: ${title}. User role: ${userRole}.`,
    objective,
    scoringGuide,
    difficultyGuide,
    dialogGuide,
    scenario?.id === 'cafe' ? cafeDialogueGuide({ isGoalOriented, sceneCueId }) : '',
    "Be human, warm, short, and stay in character.",
    "Reply in 1-2 short sentences.",
    "All feedback is an AI Coaching Suggestion. Only text is available: leave pronunciation empty; do not infer acoustic fluency, confidence, ability improvement or spoken delivery from text.",
    "Return JSON: {\"reply\":\"...\",\"feedback\":{\"grammar\":\"...\",\"vocabulary\":\"...\",\"pronunciation\":\"...\",\"task\":\"...\"}}",
  ].join(" ");
}

function buildUserPrompt({ history, userText, scenario }) {
  const recent = scenario?.id === 'cafe' ? cafeConversationHistory(history, userText) : (Array.isArray(history) ? history : [])
    .slice(-2)
    .map((message) => `${message.role === "ai" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");

  return [
    recent ? `Conversation so far:\n${recent}` : "",
    `Latest user message: ${userText || ""}`,
  ].filter(Boolean).join("\n\n");
}

const STRUCTURED_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    feedback: {
      type: "object",
      additionalProperties: false,
      properties: {
        grammar: { type: "string" },
        vocabulary: { type: "string" },
        pronunciation: { type: "string" },
        task: { type: "string" },
      },
      required: ["grammar", "vocabulary", "pronunciation", "task"],
    },
  },
  required: ["reply", "feedback"],
};

function fallbackPayload({ userText, isGoalOriented, scenarioData, scoring, mode }) {
  const safeUserText = String(userText || "").trim();
  const topic = isGoalOriented
    ? scenarioData?.goal || "the task"
    : scenarioData?.topic || "the topic";
  const styleTail = scoring === "ielts"
    ? "Try to answer with a clear reason, example, and connected ideas."
    : scoring === "toefl"
      ? "Try to organize your answer with one main point and one relevant detail at a natural pace."
      : mode === "advanced"
        ? "Keep it natural and specific."
        : "Keep it simple and clear.";

  const reflective = safeUserText
    ? safeUserText.split(/\s+/).length <= 5
      ? `I heard you say "${safeUserText}".`
      : `I understand. You said "${safeUserText.split(/\s+/).slice(0, 10).join(" ")}${safeUserText.split(/\s+/).length > 10 ? "..." : ""}"`
    : "I understand.";

  return {
    source: "fallback",
    fallback_reason: "model_unavailable",
    reply: isGoalOriented
      ? `${reflective} Let's focus on ${topic.toLowerCase()}. What exactly do you need help with? ${styleTail}`
      : `${reflective} Tell me a little more about ${topic.toLowerCase()}. ${styleTail}`,
    feedback: {
      grammar: "Use one complete sentence with a subject, verb, and clear idea.",
      vocabulary: "Add one more specific word or detail to sound more natural.",
      pronunciation: "",
      task: isGoalOriented
        ? "State the problem, your request, and the result you want."
        : "Add one reason, feeling, or personal example to develop your answer.",
    },
  };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body || {};
  const { scenario, scenarioData, history, userText, mode, scoring, isGoalOriented, sceneCueId } = payload;

  try {
    const { provider, model, parsed } = await requestStructuredLlm({
      schemaName: "voice_chat_reply",
      schema: STRUCTURED_REPLY_SCHEMA,
      openaiModels: [
        process.env.OPENAI_VOICE_CHAT_MODEL,
        "gpt-5-mini",
        "gpt-5",
        "gpt-4.1",
      ],
      openrouterModels: [
        process.env.OPENROUTER_VOICE_CHAT_MODEL,
        "openrouter/free",
      ],
      timeoutMs: 7800,
      maxModelsPerProvider: 1,
      retryOnce: true,
      systemText: buildSystemPrompt({ scenario, scenarioData, mode, scoring, isGoalOriented, sceneCueId }),
      userText: buildUserPrompt({ history, userText, scenario }),
    });

    res.status(200).json({
      source: "ai",
      provider,
      model,
      reply: parsed.reply,
      feedback: {
        grammar: parsed.feedback?.grammar || "",
        vocabulary: parsed.feedback?.vocabulary || "",
        pronunciation: "",
        task: parsed.feedback?.task || "",
      },
    });
  } catch (error) {
    console.error("voice-chat api error:", error);
    res.status(200).json({
      ...(scenario?.id === 'cafe' ? cafeLocalPractice({ userText, isGoalOriented, sceneCueId }) : fallbackPayload({ userText, isGoalOriented, scenarioData, scoring, mode })),
      fallback_reason: error?.message || "request_failed",
    });
  }
}

export default protectedApi(handler, { ai: true });
