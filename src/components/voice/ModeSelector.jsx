import { motion, AnimatePresence } from "framer-motion";
import { Zap, Sparkles, Target, MessageCircle, BookOpen, GraduationCap, Coffee, ArrowLeft, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

const STEPS = ["mode", "dialog", "scoring"];

export default function ModeSelector({ scenario, onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const locked = useRef(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [selections, setSelections] = useState({
    mode: null,
    dialogMode: null,
    scoringStandard: null,
  });

  const handleSelect = (key, value) => {
    if (locked.current) return;
    locked.current = true;
    setTransitioning(true);
    const updated = { ...selections, [key]: value };
    setSelections(updated);

    if (step < STEPS.length - 1) {
      timer.current = setTimeout(() => { setStep(current => current + 1); locked.current = false; setTransitioning(false); }, 200);
    } else {
      onComplete(updated);
    }
  };

  const goBack = () => {
    clearTimeout(timer.current);
    locked.current = false;
    setTransitioning(false);
    if (step === 0) {
      onBack();
    } else {
      setStep(step - 1);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onBack(); }}>
    <Dialog.Portal>
    <Dialog.Content asChild aria-describedby={undefined}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="practice-mode-dialog fixed inset-0 h-dvh bg-background z-[60] flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button onClick={goBack} aria-label={step === 0 ? "Close practice setup" : "Previous step"} className="p-3 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div>
          <Dialog.Title className="font-semibold text-foreground">{scenario.title}</Dialog.Title>
          <div className="flex gap-1 mt-1">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-0.5 w-8 rounded-full ${i <= step ? 'bg-primary' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <StepContent key="mode" title="Choose Practice Mode">
              <OptionCard
                icon={Zap}
                title="Basic"
                desc="Guided conversation with simpler vocabulary and slower pace"
                disabled={transitioning}
                selected={selections.mode === "basic"}
                onClick={() => handleSelect("mode", "basic")}
                gradient="from-emerald-500 to-teal-600"
              />
              <OptionCard
                icon={Sparkles}
                title="Advanced"
                desc="Natural conversation with complex topics and expressions"
                disabled={transitioning}
                selected={selections.mode === "advanced"}
                onClick={() => handleSelect("mode", "advanced")}
                gradient="from-violet-500 to-purple-600"
              />
            </StepContent>
          )}

          {step === 1 && (
            <StepContent key="dialog" title="Choose Dialog Mode">
              <OptionCard
                icon={Target}
                title="Goal-Oriented"
                desc="Complete a specific task with clear objectives"
                disabled={transitioning}
                selected={selections.dialogMode === "goal_oriented"}
                onClick={() => handleSelect("dialogMode", "goal_oriented")}
                gradient="from-amber-500 to-orange-600"
              />
              <OptionCard
                icon={MessageCircle}
                title="Free Talk"
                desc="Open conversation without specific goals"
                disabled={transitioning}
                selected={selections.dialogMode === "free_talk"}
                onClick={() => handleSelect("dialogMode", "free_talk")}
                gradient="from-cyan-500 to-blue-600"
              />
            </StepContent>
          )}

          {step === 2 && (
            <StepContent key="scoring" title="Choose Scoring Standard">
              <OptionCard
                icon={BookOpen}
                title="IELTS"
                desc="Band 1-9 · fluency, vocabulary, grammar, pronunciation"
                disabled={transitioning}
                selected={selections.scoringStandard === "ielts"}
                onClick={() => handleSelect("scoringStandard", "ielts")}
                gradient="from-red-500 to-rose-600"
              />
              <OptionCard
                icon={GraduationCap}
                title="TOEFL"
                desc="Current 1-6 scale · delivery, language use, topic development"
                disabled={transitioning}
                selected={selections.scoringStandard === "toefl"}
                onClick={() => handleSelect("scoringStandard", "toefl")}
                gradient="from-blue-500 to-indigo-600"
              />
              <OptionCard
                icon={Coffee}
                title="Daily"
                desc="Casual feedback for everyday practice"
                disabled={transitioning}
                selected={selections.scoringStandard === "daily"}
                onClick={() => handleSelect("scoringStandard", "daily")}
                gradient="from-green-500 to-emerald-600"
              />
            </StepContent>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepContent({ title, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="mx-auto w-full max-w-md space-y-4 py-4"
    >
      <h3 className="text-xl font-bold text-center mb-6 font-space">{title}</h3>
      {children}
    </motion.div>
  );
}

function OptionCard({ icon: Icon, title, desc, selected, onClick, gradient, disabled = false }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type="button" disabled={disabled} aria-pressed={selected}
      onClick={onClick}
      className={`w-full glass glass-hover rounded-2xl p-5 text-left flex items-center gap-4 transition-all ${
        selected ? "ring-2 ring-primary glow-purple" : ""
      }`}
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </motion.button>
  );
}
