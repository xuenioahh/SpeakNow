import { getExamStandard, getScoreDescriptor, roundExamScore, EXAM_STANDARDS_VERSION } from './examStandards.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value, scoring) {
  if (scoring === "ielts") return roundExamScore(value, scoring);
  if (scoring === "toefl") return roundExamScore(1 + ((clamp(value, 2, 9) - 2) * 5) / 7, scoring);
  return roundExamScore(value, scoring);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractTopicWords(text) {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 4)
  )].slice(0, 6);
}

function extractMeaningfulLines(pageTexts, limit = 6) {
  const lines = (pageTexts || [])
    .flatMap((pageText) => String(pageText || "").split(/\n+/))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 90)
    .filter((line) => /[a-zA-Z]/.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^page\s+\d+/i.test(line));

  return [...new Set(lines)].slice(0, limit);
}

function extractPageSignals(text) {
  const safeText = String(text || "").trim();
  const lowered = safeText.toLowerCase();
  const lines = safeText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bulletCount = countMatches(lowered, /(?:^|\n)\s*(?:[-*•]|\d+[.)])/g);
  const numberedFlow = countMatches(lowered, /\b(first|second|third|next|finally|step)\b/g);
  const chartTerms = countMatches(lowered, /\b(chart|graph|trend|increase|decrease|growth|compare|comparison|rate|percent|percentage|distribution|data|survey|table)\b/g);
  const conclusionTerms = countMatches(lowered, /\b(conclusion|summary|takeaway|in summary|overall|finally|thank you|questions)\b/g);
  const conceptTerms = countMatches(lowered, /\b(is defined as|definition|means|refers to|concept|theory|framework|model)\b/g);
  const questionTerms = countMatches(lowered, /\?/g);
  return {
    text: safeText,
    lowered,
    lines,
    bulletCount,
    numberedFlow,
    chartTerms,
    conclusionTerms,
    conceptTerms,
    questionTerms,
  };
}

function classifyPresentationPage(text, pageNumber = 1, totalPages = 1) {
  const signals = extractPageSignals(text);
  const isOpeningZone = pageNumber <= Math.max(1, Math.ceil(totalPages * 0.12));
  const isClosingZone = pageNumber >= Math.max(1, totalPages - Math.ceil(totalPages * 0.12));
  const shortLineCount = signals.lines.filter((line) => line.length <= 60).length;

  if ((isOpeningZone && signals.lines.length <= 6 && shortLineCount >= Math.max(2, signals.lines.length - 1)) || /^(title|overview|agenda)\b/i.test(signals.lines[0] || "")) {
    return "title";
  }
  if (signals.conclusionTerms >= 1 || (isClosingZone && /\b(result|future|recommendation|takeaway)\b/.test(signals.lowered))) {
    return "conclusion";
  }
  if (signals.chartTerms >= 2 || /[%$]/.test(signals.text)) {
    return "chart";
  }
  if (signals.bulletCount >= 2 || signals.numberedFlow >= 2) {
    return "list";
  }
  if (signals.conceptTerms >= 1 || /\bwhat is\b/.test(signals.lowered)) {
    return "concept";
  }
  return "concept";
}

function getPageTypeDescriptor(pageType) {
  switch (pageType) {
    case "title":
      return {
        label: "opening page",
        overview: "Starts the topic and sets audience expectations.",
        quickMove: "State the topic, scope, and what the audience should listen for.",
      };
    case "chart":
      return {
        label: "chart page",
        overview: "Shows data, comparison, or change over time.",
        quickMove: "Name the biggest trend first, then explain one reason or contrast.",
      };
    case "list":
      return {
        label: "list page",
        overview: "Organizes multiple points or steps.",
        quickMove: "Group the bullets into 2 or 3 chunks instead of reading every line.",
      };
    case "conclusion":
      return {
        label: "closing page",
        overview: "Wraps up the argument or takeaway.",
        quickMove: "Restate the result and end with one action or takeaway.",
      };
    default:
      return {
        label: "concept page",
        overview: "Introduces or explains a core idea.",
        quickMove: "Define the idea first, then explain why it matters.",
      };
  }
}

function buildPageTypeCoaching(pageType, keywords = [], pageText = "") {
  const main = keywords[0] || "the main idea";
  const support = keywords[1] || keywords[0] || "the key detail";

  switch (pageType) {
    case "title":
      return {
        pageIdea: `This is the opening page, so frame the talk around ${main}.`,
        supportPoint: "Tell the audience what they should listen for before you move to details.",
        liveExample: `You can say: "Today I am introducing ${main}, and I want you to focus on ${support} as we move through the presentation."`,
        visualHint: "Use the title and subtitle only. Do not read every visible line.",
      };
    case "chart":
      return {
        pageIdea: `This page shows data about ${main}.`,
        supportPoint: `Say the biggest change or comparison first, then explain ${support}.`,
        liveExample: `You can say: "The main pattern here is ${main}, and the most important change is ${support}."`,
        visualHint: "Point to the trend, highest value, or contrast before giving interpretation.",
      };
    case "list":
      return {
        pageIdea: `This page organizes several points about ${main}.`,
        supportPoint: `Group the items under one short heading, then highlight ${support}.`,
        liveExample: `You can say: "This page has three main points about ${main}, and the most important one is ${support}."`,
        visualHint: "Scan the bullets into a small structure instead of reading them line by line.",
      };
    case "conclusion":
      return {
        pageIdea: `This page closes the section and brings the message back to ${main}.`,
        supportPoint: `Restate the result clearly, then leave the audience with ${support}.`,
        liveExample: `You can say: "To conclude, this presentation shows ${main}, and the key takeaway is ${support}."`,
        visualHint: "Slow down on the final line and make the takeaway sound deliberate.",
      };
    default:
      return {
        pageIdea: `This page explains the concept of ${main}.`,
        supportPoint: `Define it in plain language, then connect it to ${support}.`,
        liveExample: `You can say: "Here, ${main} means ${support}, and that matters because it shapes the rest of this section."`,
        visualHint: "Name the term first, then explain the meaning and relevance.",
      };
  }
}

function summarizeDeckShape(pageTexts) {
  const pages = (pageTexts || []).filter(Boolean);
  const totalPages = Math.max(pages.length, 1);
  const counts = { title: 0, chart: 0, list: 0, concept: 0, conclusion: 0 };

  pages.forEach((pageText, index) => {
    const pageType = classifyPresentationPage(pageText, index + 1, totalPages);
    counts[pageType] += 1;
  });

  const dominantType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "concept";
  return { totalPages, counts, dominantType };
}

function sentenceCase(text) {
  const safeText = String(text || "").trim();
  if (!safeText) return "";
  return safeText.charAt(0).toUpperCase() + safeText.slice(1);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function formatMetricLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findGrammarIssue(text) {
  const patterns = [
    { test: /\bi am agree\b/i, correction: "I agree", category: "verb form" },
    { test: /\bhe go\b/i, correction: "he goes", category: "subject-verb agreement" },
    { test: /\bshe go\b/i, correction: "she goes", category: "subject-verb agreement" },
    { test: /\bi goed\b/i, correction: "I went", category: "past tense" },
    { test: /\bmore better\b/i, correction: "better", category: "comparative form" },
    { test: /\bpeople is\b/i, correction: "people are", category: "subject-verb agreement" },
  ];

  return patterns.find((pattern) => pattern.test.test(text)) || null;
}

function createConversationFeedback(userText, scenarioTitle, mode) {
  const safeUserText = (userText || "").trim();
  const safeScenarioTitle = scenarioTitle || "this scenario";
  const grammarIssue = findGrammarIssue(safeUserText);
  const topicWords = extractTopicWords(`${safeScenarioTitle} ${safeUserText}`);
  const advancedStarter =
    mode === "advanced"
      ? "A more natural upgrade would be:"
      : "A clearer version would be:";

  const grammar = grammarIssue
    ? `Try saying "${grammarIssue.correction}." ${advancedStarter} "I think ${grammarIssue.correction.toLowerCase()} because it fits the situation better."`
    : `${advancedStarter} "I think ${safeUserText || "this idea"} because it helps me explain my point more clearly."`;

  const vocabularyFocus = topicWords[0] || "details";
  const vocabulary = `Use more precise words around "${vocabularyFocus}". Try adding one specific detail and one reason to sound more natural.`;

  const pronunciation = safeUserText.split(" ").filter(Boolean).length < 4
    ? "Slow down and stress the key content word at the end of your sentence."
    : `Focus on sentence stress in "${safeUserText.split(" ").slice(-3).join(" ")}".`;

  return { grammar, vocabulary, pronunciation };
}

function buildScenarioCoverageFeedback({ userText, scenarioData, isGoalOriented }) {
  const normalized = (userText || "").toLowerCase();
  const sourceText = `${scenarioData?.goal || ""} ${scenarioData?.context || ""} ${scenarioData?.successCriteria || ""}`.toLowerCase();
  const scenarioKeywords = [...new Set(
    sourceText
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 4)
  )].slice(0, 8);
  const covered = scenarioKeywords.filter((word) => normalized.includes(word));
  const detailCount = (userText || "").trim().split(/\s+/).filter(Boolean).length;

  if (isGoalOriented) {
    if (covered.length >= 2 && detailCount >= 10) {
      return `You addressed the task well by mentioning ${covered.slice(0, 2).join(" and ")}. Add one clearer request or confirmation to complete the goal.`;
    }
    if (covered.length >= 1) {
      return `You started the task by mentioning ${covered[0]}. Now add one missing detail from the goal, such as the action you want or the outcome you need.`;
    }
    return "Your answer is understandable, but it does not clearly target the scenario goal yet. State the problem, the request, and the expected result more directly.";
  }

  if (detailCount >= 12) {
    return "Your answer has enough length to sound natural. Make it stronger by adding one personal example or opinion linked to the topic.";
  }

  return "Your answer is a bit short for free speaking. Add one reason and one extra detail so the conversation feels more natural.";
}

function pickLatestQuestion(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  for (let i = safeHistory.length - 1; i >= 0; i -= 1) {
    const message = safeHistory[i];
    if (message?.role === "ai" && typeof message.content === "string" && message.content.includes("?")) {
      return message.content;
    }
  }
  return "";
}

function extractUserDetails(text) {
  const safeText = (text || "").trim();
  const lowered = safeText.toLowerCase();
  const stopTopics = new Set([
    "think", "would", "could", "should", "really", "usually", "because",
    "going", "feels", "about", "there", "their", "which", "where", "while",
    "first", "today", "thing", "things", "answer", "detail", "example",
  ]);
  const topics = extractTopicWords(safeText).filter((word) => !stopTopics.has(word));
  return {
    raw: safeText,
    lowered,
    topics,
    destination: /\b(america|usa|new york|london|paris|tokyo)\b/i.exec(safeText)?.[0] || "",
    amount: /\$?\d+(?:\.\d+)?/.exec(safeText)?.[0] || "",
    time: /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)?\b/i.exec(safeText)?.[0] || "",
    feeling: /\b(excited|nervous|worried|happy|tired|stressed|upset|confused)\b/i.exec(safeText)?.[0] || "",
  };
}

function buildReflectiveResponse(details, isGoalOriented) {
  const snippet = details.raw.replace(/\s+/g, " ").trim();
  const shortSnippet = snippet.split(/\s+/).slice(0, 8).join(" ");

  if (details.feeling) {
    return isGoalOriented
      ? `I understand that you feel ${details.feeling} about this.`
      : `You sound ${details.feeling}, and that makes sense.`;
  }
  if (details.destination) {
    return `So this is about ${details.destination}.`;
  }
  if (details.amount) {
    return `Okay, I caught the amount ${details.amount}.`;
  }
  if (details.time) {
    return `All right, you mentioned ${details.time}.`;
  }
  if (details.topics[0]) {
    return `I see, you're talking about ${details.topics[0]}.`;
  }
  if (shortSnippet) {
    return `I heard you say "${shortSnippet}${snippet.split(/\s+/).length > 8 ? "..." : ""}"`;
  }
  return isGoalOriented ? "All right, I understand the situation." : "I see what you mean.";
}

function buildScenarioSignature(scenarioId, isGoalOriented) {
  const modeKey = isGoalOriented ? "goal" : "free";
  return `${scenarioId || "general"}:${modeKey}`;
}

function buildPersonalizedLead(signature, details) {
  const topic = details.topics[0] || "";
  switch (signature) {
    case "airport:goal":
      if (details.destination) return `All right, you're traveling to ${details.destination}.`;
      return "Okay, let me help you with your flight.";
    case "airport:free":
      if (details.destination) return `Nice, ${details.destination} sounds exciting.`;
      return "Air travel can be quite an experience.";
    case "bank:goal":
      if (details.amount) return `Okay, I heard the amount ${details.amount}.`;
      return "Sure, let's sort this out step by step.";
    case "bank:free":
      if (topic) return `Interesting, you mentioned ${topic}.`;
      return "Banking can be confusing at first.";
    case "hotel:goal":
      return "Of course. Let me help with that.";
    case "restaurant:goal":
      return "No problem. I'll help you with the order.";
    case "shopping:goal":
      return "All right, let's see what we can do for you.";
    case "hospital:goal":
      return "Okay. Tell me a little more about the problem.";
    case "office:goal":
      return "All right, let's work through this clearly.";
    default:
      if (details.feeling) return `I can hear that you feel ${details.feeling}.`;
      if (topic) return `Interesting, you brought up ${topic}.`;
      return "Okay.";
  }
}

function buildScenarioSpecificQuestion(signature, details, latestQuestion, isShort) {
  switch (signature) {
    case "airport:goal":
      if (details.destination) return "What exactly do you need right now: check-in help, gate information, or a schedule update?";
      if (details.time) return `Do you want to confirm the time ${details.time}, or are you asking about a delay?`;
      return "What exactly do you need help with at the airport?";
    case "airport:free":
      if (details.destination) return `Why are you going to ${details.destination}?`;
      return "Do you enjoy airports, or do you usually find them stressful?";
    case "bank:goal":
      if (details.amount) return `Is ${details.amount} the amount you want to deposit, transfer, or check?`;
      return "What do you want to do today: open an account, check a charge, or ask about fees?";
    case "bank:free":
      return "Do you usually prefer saving money, spending it, or investing it?";
    case "hotel:goal":
      return "What do you need first: the room key, the booking details, or the checkout time?";
    case "hotel:free":
      return "What matters more to you in a hotel: comfort, location, or service?";
    case "restaurant:goal":
      return "What would you like to order, and is there anything you need to avoid?";
    case "restaurant:free":
      return "What kind of food do you usually enjoy most?";
    case "shopping:goal":
      return "Do you want a refund, an exchange, or help choosing another item?";
    case "shopping:free":
      return "Do you usually shop based on price, quality, or brand?";
    case "hospital:goal":
      return "When did the problem start, and how serious is it now?";
    case "hospital:free":
      return "What do you usually do to stay healthy?";
    case "university:goal":
      return "Which courses or requirements are you most concerned about right now?";
    case "university:free":
      return "What subject do you enjoy most, and why?";
    case "office:goal":
      return "What outcome are you hoping for from your manager today?";
    case "office:free":
      return "What part of your work do you enjoy most right now?";
    case "phone:goal":
      return "Can you tell me exactly what charge or issue you want to fix?";
    case "phone:free":
      return "What do you use your phone for most every day?";
    case "car_rental:goal":
      return "What kind of car do you need, and for how long?";
    case "car_rental:free":
      return "Do you enjoy long road trips, or do you prefer short drives?";
    case "museum:goal":
      return "Which painting or artist do you want to know more about first?";
    case "museum:free":
      return "What kind of art usually catches your attention first?";
    case "cafe:goal":
      return "How many drinks do you need, and what kind of pastries are you looking for?";
    case "cafe:free":
      return "What kind of coffee do you usually go for?";
    default:
      if (isShort && latestQuestion) return latestQuestion;
      return "Can you give me one more specific detail?";
  }
}

function buildScoringStyle(scoring, mode, isGoalOriented) {
  if (scoring === "ielts") {
    return {
      lead: mode === "advanced" ? "Give a fuller answer with a clear reason and example." : "Answer clearly in full sentences.",
      followUp: isGoalOriented
        ? "Try to sound precise and task-focused."
        : "Try to add a personal opinion and support it naturally.",
    };
  }
  if (scoring === "toefl") {
    return {
      lead: mode === "advanced" ? "Make your answer organized and academic." : "Keep your answer organized and easy to follow.",
      followUp: isGoalOriented
        ? "State the problem first, then your request, then the expected result."
        : "Give one main point first, then support it with a detail.",
    };
  }
  return {
    lead: mode === "advanced" ? "Keep it natural and specific." : "Keep it simple and natural.",
    followUp: isGoalOriented
      ? "Focus on what you need in this situation."
      : "Sound like a real conversation, not a textbook answer.",
  };
}

function buildRoleplayReply({
  scenario,
  scenarioData,
  history,
  userText,
  scoring,
  mode,
  isGoalOriented,
}) {
  const safeScenario = scenario || {};
  const safeScenarioData = scenarioData || {};
  const safeUserText = (userText || "").trim().replace(/\s+/g, " ");
  const latestQuestion = pickLatestQuestion(history);
  const isShort = safeUserText.split(/\s+/).filter(Boolean).length < 7;
  const title = (safeScenario.title || "this situation").toString();
  const topic = (safeScenarioData.topic || title).toString();
  const signature = buildScenarioSignature(safeScenario.id, isGoalOriented);
  const details = extractUserDetails(safeUserText);
  const lead = buildPersonalizedLead(signature, details);
  const reflective = buildReflectiveResponse(details, isGoalOriented);
  const specificQuestion = buildScenarioSpecificQuestion(signature, details, latestQuestion, isShort);
  const scoringStyle = buildScoringStyle(scoring, mode, isGoalOriented);

  if (isGoalOriented) {
    if (isShort) {
      return latestQuestion
        ? `${lead} ${reflective} ${latestQuestion} ${scoringStyle.lead}`
        : `${lead} ${reflective} Please explain the situation clearly. What happened, and what help do you need? ${scoringStyle.followUp}`;
    }
    return `${lead} ${reflective} ${specificQuestion} ${scoringStyle.followUp}`;
  }

  const asksOpinion = /\b(i think|i like|i prefer|in my opinion)\b/.test(details.lowered);
  const asksExperience = /\b(first time|before|usually|often|sometimes|experience)\b/.test(details.lowered);
  const mentionsArt = /\b(art|museum|painting|artist|modern|history|exhibit)\b/.test(details.lowered);
  const vagueWord = safeUserText.split(/\s+/).filter(Boolean).length <= 2;

  if (vagueWord) {
    return latestQuestion
      ? `${lead} ${reflective} ${latestQuestion} ${scoringStyle.lead}`
      : `${lead} ${reflective} Tell me one clear idea, example, or experience about ${topic.toLowerCase()}. ${scoringStyle.followUp}`;
  }
  if (asksExperience) {
    return `${lead} ${reflective} What happened next, and how did you feel about it? ${scoringStyle.followUp}`;
  }
  if (mentionsArt) {
    return `${lead} ${reflective} What kind of art attracts you most, and why? ${scoringStyle.followUp}`;
  }
  if (asksOpinion) {
    return `${lead} ${reflective} Can you support that opinion with one real example? ${scoringStyle.followUp}`;
  }
  if (mode === "advanced") {
    return `${lead} ${reflective} Now develop that idea more naturally. ${specificQuestion} ${scoringStyle.lead}`;
  }
  return `${lead} ${reflective} ${specificQuestion} ${scoringStyle.followUp}`;
}

export function generateConversationReply({
  scenario,
  scenarioData,
  history,
  userText,
  scoring,
  mode,
  isGoalOriented,
}) {
  const safeScenario = scenario || {};
  const safeScenarioData = scenarioData || {};
  const safeUserText = (userText || "").trim();
  const scenarioCoverage = buildScenarioCoverageFeedback({ userText: safeUserText, scenarioData: safeScenarioData, isGoalOriented });
  const reply = buildRoleplayReply({
    scenario: safeScenario,
    scenarioData: safeScenarioData,
    history,
    userText: safeUserText,
    scoring,
    mode,
    isGoalOriented,
  });

  return {
    reply,
    feedback: {
      ...createConversationFeedback(safeUserText, safeScenario.title, mode),
      task: scenarioCoverage,
    },
  };
}

export function generateVoiceReport({
  messages,
  scoring,
  duration,
  words,
  exchanges,
  scenarioTitle,
  mode,
  dialogMode,
}) {
  const userMessages = messages.filter((message) => message.role === "user");
  const fullUserText = userMessages.map((message) => message.content).join(" ");
  const avgWords = userMessages.length ? words / userMessages.length : 0;
  const questionsAsked = countMatches(fullUserText, /\?/g);
  const connectors = countMatches(
    fullUserText.toLowerCase(),
    /\b(because|however|although|therefore|meanwhile|actually|instead)\b/g
  );
  const grammarIssue = findGrammarIssue(fullUserText);

  const baseFluency = clamp(5 + avgWords / 5 + exchanges / 6, 2, 9);
  const baseLexical = clamp(5 + extractTopicWords(fullUserText).length / 2 + connectors / 3, 2, 9);
  const baseGrammar = clamp(6 - (grammarIssue ? 1 : 0) + connectors / 4, 2, 9);
  const basePronunciation = clamp(5 + Math.min(questionsAsked, 3) / 2 + avgWords / 8, 2, 9);

  const scores = {
    Fluency: roundScore(baseFluency, scoring),
    Lexical: roundScore(baseLexical, scoring),
    Grammar: roundScore(baseGrammar, scoring),
    Pronunciation: roundScore(basePronunciation, scoring),
  };

  const standard = getExamStandard(scoring);
  const totalScore = roundExamScore(average(Object.values(scores)), scoring);

  const suggestions = [
    `Practice longer answers in ${scenarioTitle} so each response includes a reason and an example.`,
    mode === "advanced"
      ? "Use more linking phrases such as however, therefore, and on the other hand."
      : "Add one extra supporting detail after each main answer.",
    dialogMode === "goal_oriented"
      ? "State your goal clearly at the start of the conversation, then confirm the outcome at the end."
      : "Ask one follow-up question in each exchange to keep the conversation moving naturally.",
  ];

  return {
    source: "heuristic",
    measurement_basis: "text-rules-not-acoustic-measurement",
    scores,
    totalScore,
    scoring_standard: scoring,
    scoring_framework: {
      version: EXAM_STANDARDS_VERSION,
      label: standard.label,
      criteria: standard.criteria,
      practice_estimate: true,
      descriptor: getScoreDescriptor(totalScore, scoring),
      strategy: standard.strategy,
      official_scale_note: scoring === 'toefl'
        ? 'Current TOEFL iBT score reports use a 1–6 scale from January 21, 2026. A comparable 0–120 total may appear during the transition, but this practice report uses the current section scale.'
        : scoring === 'ielts' ? 'IELTS Speaking uses four equally weighted criteria and half-band increments. This is an estimate, not an official examiner score.' : '',
    },
    grammar_analysis: grammarIssue
      ? [
          {
            error: fullUserText,
            correction: fullUserText.replace(grammarIssue.test, grammarIssue.correction),
            category: grammarIssue.category,
          },
        ]
      : [
          {
            error: "No major repeated grammar pattern detected",
            correction: "Keep monitoring article use and verb endings in longer answers",
            category: "overall accuracy",
          },
        ],
    vocabulary_analysis: {
      range: extractTopicWords(fullUserText).length >= 4 ? "Good topical range" : "Basic but understandable range",
      accuracy: connectors >= 2 ? "Mostly accurate word choice" : "Clear meaning, but vocabulary can be more specific",
      suggestions: extractTopicWords(fullUserText).slice(0, 3).map((word) => `Reuse "${word}" in a longer, more precise sentence.`),
    },
    pronunciation_analysis: {
      problem_sounds: ["sentence stress", "content-word emphasis"],
      word_stress: "Stress the final key noun or verb in each response.",
      intonation: "Let your pitch rise slightly when asking questions and fall clearly when giving a final answer.",
    },
    fluency_analysis: {
      speech_rate: avgWords > 12 ? "Comfortable pace" : "Slightly short turns; expand responses",
      unnatural_pauses: duration > 0 && exchanges > 0 ? "Some pauses likely appeared between ideas" : "Not enough data",
      fillers: avgWords > 10 ? "Likely controlled" : "Watch for repeated fillers such as um or like",
    },
    conversation_review: userMessages.slice(0, 3).map((message, index) => ({
      original: message.content,
      correction: `${message.content}${message.content.endsWith(".") ? "" : "."} Add one supporting reason to strengthen this answer.`,
      category: index === 0 ? "development" : "clarity",
    })),
    suggestions,
  };
}

export function generatePresentationReport({
  duration,
  totalPages,
  pageTimings,
  fileName,
  transcript,
  pageTexts,
  pauseHistory,
}) {
  const transcriptText = (transcript || "").trim();
  const joinedPageText = (pageTexts || []).join(" ").trim();
  const transcriptWords = extractTopicWords(transcriptText);
  const documentWords = extractTopicWords(joinedPageText);
  const overlap = transcriptWords.filter((word) => documentWords.includes(word)).length;
  const coverageRatio = documentWords.length
    ? clamp(overlap / documentWords.length, 0, 1)
    : 0;
  const pauses = pauseHistory || [];
  const pauseScores = pauses.map((entry) => entry.score).filter((value) => typeof value === "number");
  const averagePauseScore = pauseScores.length ? average(pauseScores) : 72;
  const recentPauseScore = pauseScores.length ? pauseScores[pauseScores.length - 1] : averagePauseScore;
  const trendScore = pauseScores.length > 1 ? recentPauseScore - pauseScores[0] : 0;
  const avgSeconds = totalPages > 0 ? duration / totalPages : duration;
  const deckShape = summarizeDeckShape(pageTexts || []);
  const dominantDescriptor = getPageTypeDescriptor(deckShape.dominantType);
  const content = clamp(6 + totalPages / 4, 4, 9.5);
  const delivery = clamp(5.2 + (averagePauseScore - 60) / 12 + (duration > 120 ? 0.7 : 0) + (avgSeconds >= 20 ? 0.4 : -0.4), 4, 9.5);
  const bodyLanguage = clamp(5.6 + (averagePauseScore - 60) / 14 + (duration > 90 ? 0.4 : 0), 4, 9.5);
  const engagement = clamp(5.8 + Math.min(totalPages, 10) / 5 + (transcriptText ? 0.5 : 0) + trendScore / 18, 4, 9.5);
  const documentHandling = clamp(6 + (pageTimings.length === totalPages ? 1 : 0) + overlap / 4, 4, 9.5);

  const scores = {
    content: Math.round(content * 10) / 10,
    delivery: Math.round(delivery * 10) / 10,
    body_language: Math.round(bodyLanguage * 10) / 10,
    engagement: Math.round(engagement * 10) / 10,
    document_handling: Math.round(documentHandling * 10) / 10,
  };

  const pageAssessments = pageTimings
    .map((seconds, index) => {
      if (typeof seconds !== "number" || seconds <= 0) return null;

    const assessment =
      seconds > avgSeconds * 1.3
        ? "Too long"
        : seconds < avgSeconds * 0.7
          ? "Too brief"
          : "Good pacing";

      return {
        page: index + 1,
        time_spent: `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
        assessment,
      };
    })
    .filter(Boolean);

  return {
    overall_score: Math.round(average(Object.values(scores)) * 10) / 10,
    scores,
    time_analysis: {
      total_duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
      avg_per_page: `${Math.floor(avgSeconds / 60)}m ${Math.round(avgSeconds % 60)}s`,
      recommendation:
        avgSeconds < 20
          ? `Slow down on key slides and add one concrete example before moving on, especially on ${dominantDescriptor.label}s.`
          : `Pacing is workable. Tighten any slide that runs much longer than the average, especially when a ${dominantDescriptor.label} becomes too detailed.`,
      page_assessments: pageAssessments,
    },
    feedback: {
      pdf_alignment: {
        strengths: joinedPageText
          ? overlap > 1
            ? `Your speech reused key terms from ${fileName}, so the talk stayed close to the uploaded PDF.`
            : `The uploaded PDF was available throughout the session, which gives you a clear structure to follow.`
          : "No extracted PDF text was available, so alignment was estimated from pacing only.",
        improvements: joinedPageText
          ? coverageRatio >= 0.5
            ? "Keep naming the slide takeaway first, then add one short explanation from your own words."
            : "Call out more exact terms or headings from the current PDF page before adding your explanation."
          : "Upload a text-based PDF when possible so the report can compare your speech with each page more precisely.",
      },
      content: {
        strengths: overlap > 1
          ? `Your spoken content matched several key ideas from ${fileName}.`
          : `${fileName} appears structured enough for a guided walk-through.`,
        improvements: transcriptText
          ? `Tie each spoken section more explicitly to the slide content. On ${dominantDescriptor.label}s, ${dominantDescriptor.quickMove.toLowerCase()}`
          : "State the main takeaway earlier and repeat it at the end.",
      },
      delivery: {
        strengths: averagePauseScore >= 76
          ? "Your pause reviews suggest steadier delivery as the session continued."
          : transcriptText
            ? "Your recorded speech gives enough material to review pacing and verbal structure."
            : "Your pacing data suggests a deliberate presentation rhythm.",
        improvements: averagePauseScore >= 76
          ? "Keep the same control, but add clearer signposting phrases between major points."
          : "Use clearer signposting phrases and smoother pacing when moving between slides.",
      },
      body_language: {
        strengths: averagePauseScore >= 74
          ? "Your live practice scores suggest a steadier presenter presence by the end."
          : "Camera-based practice supports steady presenter presence.",
        improvements: averagePauseScore >= 74
          ? "Keep eye contact strongest on the opening line and final takeaway."
          : "Keep eye contact with the camera on opening and closing lines.",
      },
    },
    suggestions: [
      overlap > 1
        ? "Continue naming the exact slide idea before expanding with explanation or evidence."
        : "Open with a one-sentence agenda before discussing the first slide.",
      deckShape.counts.chart > 0
        ? "On data-heavy pages, say the main trend first and only then explain the cause or implication."
        : "On concept-heavy pages, define the term first and avoid stacking too many abstract sentences in a row.",
      transcriptText
        ? "Use the transcript to spot repeated filler phrases and replace them with cleaner transitions."
        : "Aim for a consistent pace across slides, especially in the middle of the talk.",
      joinedPageText
        ? "For each page, say the heading or keyword from the PDF before giving your example or explanation."
        : "Use a PDF with selectable text so each pause and report can connect more directly to the document.",
      "Close by summarizing the single most important point and next action.",
    ],
    key_takeaways: [
      averagePauseScore >= 78
        ? "Your delivery stayed stable across pauses, which helped the final performance feel more controlled."
        : "Your delivery varied across pauses, so the biggest gain will come from making your pace and transitions more consistent.",
      coverageRatio >= 0.5
        ? `You stayed close to the uploaded PDF, especially when you reused document keywords in your speech.`
        : "Your talk would feel stronger if you named more exact PDF terms before explaining them.",
      deckShape.counts.list > 0
        ? "Several pages appear to be list-based, so your next improvement is to group bullets into themes instead of reading them one by one."
        : `This deck is mainly built from ${dominantDescriptor.label}s, so the strongest improvement is to match your delivery to that page style.`,
      trendScore > 4
        ? "Your later sections were stronger than your opening, so your structure improved as you went."
        : trendScore < -4
          ? "Your opening was stronger than your ending, so focus on maintaining clarity and energy through the final pages."
          : "Your performance stayed fairly even from start to finish, so your next gain is sharper emphasis on key points.",
    ],
    pdf_summary: {
      fileName,
      overlap,
      trackedKeywords: documentWords,
      transcriptKeywords: transcriptWords,
      coverageLabel:
        coverageRatio >= 0.65
          ? "High"
          : coverageRatio >= 0.35
            ? "Medium"
            : "Low",
    },
  };
}

export function generatePresentationAnalysis({
  fileName,
  pageTexts,
}) {
  const pages = (pageTexts || []).filter(Boolean);
  const joinedText = pages.join(" ").trim();
  const keywords = extractTopicWords(joinedText);
  const meaningfulLines = extractMeaningfulLines(pageTexts, 8);
  const totalPages = Math.max(pages.length, 1);
  const deckShape = summarizeDeckShape(pageTexts || []);
  const dominantDescriptor = getPageTypeDescriptor(deckShape.dominantType);
  const hasRichText = joinedText.length > 80;
  const mainTopic = keywords[0] || "core topic";
  const supportTopic = keywords[1] || "evidence";
  const outcomeTopic = keywords[2] || "takeaway";
  const openingLine = meaningfulLines[0] || sentenceCase(mainTopic);
  const middleLine = meaningfulLines[1] || sentenceCase(supportTopic);
  const closingLine = meaningfulLines[2] || sentenceCase(outcomeTopic);

  const openingLabel =
    deckShape.counts.title > 0 ? "Framed opening" : totalPages <= 3 ? "Fast overview" : totalPages <= 7 ? "Clear walkthrough" : "Guided story";
  const pacingLabel =
    deckShape.counts.chart > deckShape.counts.list ? "Trend-led" : deckShape.counts.list > 0 ? "Sectioned" : totalPages <= 3 ? "Compact" : totalPages <= 7 ? "Balanced" : "Expanded";

  return {
    title: fileName || "Presentation File",
    summary: hasRichText
      ? `This file appears to center on ${mainTopic}. Most pages read like ${dominantDescriptor.label}s, so your delivery should ${dominantDescriptor.quickMove.toLowerCase()}`
      : "The document is ready for rehearsal, but the extracted text is limited, so structure advice is based mainly on page count.",
    overviewCards: [
      {
        title: "Document Length",
        value: `${totalPages} ${totalPages === 1 ? "page" : "pages"}`,
        tone: "amber",
        detail: totalPages <= 5 ? "Short presentation" : totalPages <= 10 ? "Medium presentation" : "Long presentation",
      },
      {
        title: "Suggested Style",
        value: openingLabel,
        tone: "violet",
        detail: dominantDescriptor.overview,
      },
      {
        title: "Pacing Plan",
        value: pacingLabel,
        tone: "cyan",
        detail: dominantDescriptor.quickMove,
      },
    ],
    structureCards: [
      {
        step: "Opening",
        title: hasRichText ? sentenceCase(openingLine) : "Set the frame",
        body: hasRichText
          ? `Start with "${openingLine}" and tell the audience the topic, scope, and why it matters before moving into detail.`
          : "Open with the topic and the goal of the talk in one clear sentence.",
      },
      {
        step: "Middle",
        title: hasRichText ? sentenceCase(middleLine) : "Walk through the key pages",
        body: hasRichText
          ? deckShape.counts.chart > deckShape.counts.list
            ? `Use pages around "${middleLine}" to explain the trend first, then one contrast or reason instead of reading labels aloud.`
            : deckShape.counts.list > 0
              ? `Use pages around "${middleLine}" to group points into 2 or 3 chunks, then explain one representative detail from each chunk.`
              : `Use pages around "${middleLine}" to explain one core point at a time, with one example or contrast instead of reading slide text.`
          : "Use the middle section to explain only the main evidence, process, or comparison.",
      },
      {
        step: "Closing",
        title: hasRichText ? sentenceCase(closingLine) : "Finish with one takeaway",
        body: hasRichText
          ? `Close by returning to "${closingLine}" and tell the audience the one result or conclusion they should remember.`
          : "Finish by restating the main conclusion and the one idea the audience should remember.",
      },
    ],
    focusCards: [
      {
        title: "Priority words",
        items: (keywords.length ? keywords : ["topic", "evidence", "result"]).slice(0, 4),
      },
    ],
    presenterTips: [
      deckShape.counts.title > 0
        ? "Treat the first page as a framing moment, not a reading exercise."
        : totalPages <= 4
        ? "Do not explain every page in detail. Keep the structure tight."
        : "Announce each section clearly so the audience never loses the thread.",
      deckShape.counts.chart > 0
        ? "When a page contains data, say the pattern first, then explain the reason or implication."
        : deckShape.counts.list > 0
          ? "When a page contains bullets, combine them into themes before you elaborate."
          : "When a page introduces a concept, define it first and then explain why it matters.",
      hasRichText
        ? `Reuse visible PDF words such as ${keywords.slice(0, 2).join(" and ") || "the main headings"} before adding your own explanation.`
        : "Use the page title or heading first, then explain it in your own words.",
      hasRichText
        ? `If you get stuck, say: "This section focuses on ${mainTopic}, and the key point here is ${supportTopic}."`
        : "End with one takeaway, not a long recap.",
    ],
  };
}

export function generatePresentationPauseFeedback({
  transcript,
  page,
  elapsed,
  scores,
  history,
  currentPageText,
}) {
  const safeTranscript = (transcript || "").trim();
  const safePageText = (currentPageText || "").trim();
  const totalPagesFromHistory = Array.isArray(history)
    ? Math.max(...history.map((entry) => Number(entry?.page) || 0), page || 0, 1)
    : Math.max(page || 0, 1);
  const pageType = classifyPresentationPage(safePageText, page, totalPagesFromHistory);
  const pageDescriptor = getPageTypeDescriptor(pageType);
  const wordCount = safeTranscript ? safeTranscript.split(/\s+/).length : 0;
  const averageScore = scores
    ? Math.round(average(Object.values(scores)))
    : 72;
  const transcriptWords = extractTopicWords(safeTranscript);
  const pageWords = extractTopicWords(safePageText);
  const overlap = transcriptWords.filter((word) => pageWords.includes(word)).length;
  const scoreEntries = Object.entries(scores || {}).map(([key, value]) => ({
    key,
    label: formatMetricLabel(key),
    value,
    status: value >= 80 ? "strong" : value >= 65 ? "steady" : "needs work",
    tip:
      key === "expression"
        ? "Vary your facial expression when opening and closing a point."
        : key === "posture"
          ? "Reset your shoulders before resuming."
          : key === "eye_contact"
            ? "Return your eyes to the camera at the end of each sentence."
            : "Keep sentence rhythm smoother and reduce abrupt stops between ideas.",
  }));
  const sortedScores = [...scoreEntries].sort((a, b) => a.value - b.value);

  const strengths = [];
  const improvements = [];

  if (wordCount > 35) {
    strengths.push("You kept speaking continuously instead of stopping after short phrases.");
  } else {
    improvements.push("Extend each explanation with one extra reason or example before moving on.");
  }

  if (safePageText && overlap >= 2) {
    strengths.push("Your speech stayed aligned with the key content shown on this PDF page.");
  } else if (safePageText) {
    improvements.push("Refer more directly to the current PDF page so your explanation matches the slide content.");
  }

  if ((scores?.eye_contact || 0) >= 75) {
    strengths.push("Your eye contact looked stable during this section.");
  } else {
    improvements.push("Lift your gaze back to the camera more often at sentence endings.");
  }

  if ((scores?.fluency || 0) >= 75) {
    strengths.push("Your speech flow stayed smooth and helped the section sound connected.");
  } else {
    improvements.push("Reduce short stops and link your ideas more smoothly from one sentence to the next.");
  }

  if ((scores?.posture || 0) >= 75) {
    strengths.push("Your posture appeared steady, which supports a more confident delivery.");
  } else {
    improvements.push("Reset your shoulders and keep your upper body open before resuming.");
  }

  if ((scores?.expression || 0) >= 75) {
    strengths.push("Your facial expression helped the talk feel more engaged.");
  } else {
    improvements.push("Use a more animated expression when introducing or concluding a point.");
  }

  const pdfAlignmentCard = {
    title: "PDF Match",
    score: clamp(55 + overlap * 12, 42, 96),
    body: safePageText
      ? overlap >= 2
        ? "This section stayed close to the current PDF page. Keep naming the key phrase before you explain it."
        : "Your speech drifted from the current PDF page. Reuse one heading or keyword from this page in your next sentence."
      : "No PDF text was available for this page, so alignment could not be checked here.",
  };

  const weakestMetric = sortedScores[0] || {
    key: "fluency",
    label: "Fluency",
    value: 70,
    tip: "Keep sentence rhythm smoother and reduce abrupt stops between ideas.",
  };
  const weakestMetricCard = {
    title: weakestMetric.label,
    score: weakestMetric.value,
    body:
      improvements.find((item) => {
        const lower = item.toLowerCase();
        if (weakestMetric.key === "expression") return lower.includes("expression") || lower.includes("animated");
        if (weakestMetric.key === "posture") return lower.includes("shoulders") || lower.includes("upper body") || lower.includes("posture");
        if (weakestMetric.key === "eye_contact") return lower.includes("camera") || lower.includes("gaze") || lower.includes("eye contact");
        return lower.includes("smooth") || lower.includes("sentence") || lower.includes("stops");
      }) ||
      strengths.find((item) => item.toLowerCase().includes(weakestMetric.label.toLowerCase())) ||
      weakestMetric.tip,
  };

  const pageCoaching = buildPageTypeCoaching(pageType, pageWords, safePageText);
  const brevityPoint =
    wordCount > 24
      ? "Keep it to 2 or 3 short lines."
      : "Say it in 2 or 3 short lines.";
  const moveOnPoint =
    overlap >= 2 && wordCount >= 12
      ? "Move on when the page idea is clear."
      : "Retry this page until the page idea is clear.";
  const visualHint = safePageText
    ? `${sentenceCase(pageDescriptor.label)} detected. ${pageCoaching.visualHint}`
    : "Use the page title first, then explain one key idea only.";

  return {
    title: `Pause Feedback for Page ${page}`,
    elapsedLabel: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    transcriptPreview: safeTranscript || "No transcript captured in this segment yet.",
    pageContentPreview: safePageText || "No page text available for this segment.",
    overallScore: averageScore,
    scoreEntries,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    nextStep:
      [pageCoaching.pageIdea, pageCoaching.supportPoint, pageCoaching.liveExample].join(" "),
    history: history || [],
    priorityCards: [
      {
        title: "What this page is saying",
        score: clamp(50 + overlap * 14 + Math.min(wordCount, 20), 45, 96),
        body: `${pageCoaching.pageIdea} ${pageCoaching.supportPoint} ${pageCoaching.liveExample}`,
      },
      {
        title: "Fix this first",
        score: weakestMetric.value,
        body: `${moveOnPoint} ${brevityPoint} ${visualHint}`,
      },
    ],
  };
}
