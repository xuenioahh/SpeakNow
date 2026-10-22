import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, User, Bot, BookOpen, MessageSquare, Volume2 } from "lucide-react";
import { getScenario } from "@/lib/scenarios";
import { audioManager } from "@/lib/audioManager";
import GlowCTAButton from "@/components/GlowCTAButton";
import { getExamStandard } from "@/lib/examStandards";

export default function VoiceSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get("scenario");
  const mode = params.get("mode");
  const dialogMode = params.get("dialogMode");
  const scoring = params.get("scoring");

  useEffect(() => () => {
    audioManager.stop();
  }, []);

  const scenario = getScenario(scenarioId);

  useEffect(() => {
    if (!scenario) {
      navigate("/voice");
    }
  }, [navigate, scenario]);

  if (!scenario) {
    return null;
  }

  const isGoalOriented = dialogMode === "goal_oriented";
  const scenarioData = isGoalOriented ? scenario.goalOriented : scenario.freeTalk;
  const Icon = scenario.icon;
  const voiceLabel = scenario.aiVoice === "female" ? "Professional Female" : "Professional Male";
  const standard = getExamStandard(scoring);

  const handleStart = () => {
    audioManager.stop();
    const chatParams = new URLSearchParams({
      scenario: scenarioId,
      mode,
      dialogMode,
      scoring,
    });
    navigate(`/voice/chat?${chatParams.toString()}`);
  };

  const playText = async (text, voice = scenario.aiVoice, options = {}) => {
    if (!text) return;
    await audioManager.playAIVoice(text, voice, options);
  };

  const playOverview = async () => {
    const summary = [
      `${scenario.title}.`,
      `AI role: ${scenario.aiRole}.`,
      `Your role: ${scenarioData.userRole}.`,
      isGoalOriented ? `Goal: ${scenarioData.goal}.` : `Topic: ${scenarioData.topic}.`,
      `First sentence: ${scenarioData.firstMessage}`,
    ].filter(Boolean).join(" ");

    await playText(summary, scenario.aiVoice, { concise: true, maxSentences: 4, maxChars: 220 });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button onClick={() => {
          audioManager.stop();
          navigate(-1);
        }} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h2 className="font-semibold text-foreground">Scenario Setup</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Scenario Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 text-center"
        >
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${scenario.color} flex items-center justify-center mx-auto mb-3`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-lg font-bold font-space text-foreground">{scenario.title}</h3>
          <button
            onClick={playOverview}
            className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-[13px] text-primary"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Listen overview
          </button>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
              {mode === "basic" ? "Basic" : "Advanced"}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
              {isGoalOriented ? "Goal-Oriented" : "Free Talk"}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-medium uppercase">
              {standard.label} · {standard.max === 6 ? "1–6" : standard.max === 9 ? "1–9" : "coaching"}
            </span>
          </div>
        </motion.div>

        {/* AI Character */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-foreground">AI Character</h4>
          </div>
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">👤 Role:</span>
              <span className="text-sm text-foreground font-medium">{scenario.aiRole}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">🎤 Voice:</span>
              <span className="text-sm text-foreground font-medium">
                {voiceLabel} (consistent)
              </span>
            </div>
          </div>
          <button
            onClick={() => playText(`AI role: ${scenario.aiRole}. Voice: ${voiceLabel}.`, scenario.aiVoice)}
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary"
          >
            <Volume2 className="w-3 h-3" />
            Listen
          </button>
        </motion.div>

        {/* Your Role */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-violet-400" />
            <h4 className="text-sm font-semibold text-foreground">Your Role</h4>
          </div>
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">👤 Role:</span>
              <span className="text-sm text-foreground font-medium">{scenarioData.userRole}</span>
            </div>
            {isGoalOriented && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">🎯 Goal:</span>
                <span className="text-sm text-foreground font-medium">{scenarioData.goal}</span>
              </div>
            )}
            {!isGoalOriented && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">💬 Topic:</span>
                <span className="text-sm text-foreground font-medium">{scenarioData.topic}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => playText(
              [
                `Your role: ${scenarioData.userRole}.`,
                isGoalOriented ? `Goal: ${scenarioData.goal}.` : `Topic: ${scenarioData.topic}.`,
              ].filter(Boolean).join(" "),
              scenario.aiVoice,
              { concise: true, maxSentences: 2, maxChars: 120 }
            )}
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary"
          >
            <Volume2 className="w-3 h-3" />
            Listen
          </button>
        </motion.div>

        {/* Background Context */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-foreground">Background Context</h4>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-sm text-muted-foreground leading-relaxed">{scenarioData.context}</p>
          </div>
          <button
            onClick={() => playText(scenarioData.context, scenario.aiVoice, { concise: true, maxSentences: 2, maxChars: 140 })}
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary"
          >
            <Volume2 className="w-3 h-3" />
            Listen
          </button>
        </motion.div>

        {/* AI First Sentence */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-foreground">AI First Sentence</h4>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-sm text-foreground italic">"{scenarioData.firstMessage}"</p>
          </div>
          <button
            onClick={() => playText(scenarioData.firstMessage, scenario.aiVoice, { concise: true, maxSentences: 1, maxChars: 120 })}
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary"
          >
            <Volume2 className="w-3 h-3" />
            Listen
          </button>
        </motion.div>
      </div>

      {/* Start Button */}
      <div className="px-4 pb-6 pt-3">
        <GlowCTAButton
          onClick={handleStart}
          className="h-14 w-full justify-between bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 text-base font-semibold glow-purple-strong"
          glowClassName="bg-gradient-to-r from-violet-300/18 via-white/8 to-cyan-300/16"
        >
          <span className="inline-flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Start Conversation
          </span>
        </GlowCTAButton>
      </div>
    </div>
  );
}
