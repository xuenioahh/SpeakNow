import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const DEFAULT_STEPS = [
  "Preparing your data",
  "Analyzing content",
  "Building feedback",
  "Finalizing summary",
];

export default function LoadingProgressCard({
  title = "Loading",
  description = "Please wait a moment...",
  steps = DEFAULT_STEPS,
  durationMs = 9000,
}) {
  const safeSteps = (Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg glass rounded-[28px] border border-white/8 p-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{description}</p>
          </div>
        </div>

        <p className="mt-5 text-sm text-muted-foreground" role="status">Working on your actual request. This view closes when the result is ready.</p>
        <div className="mt-5 space-y-2">
          {safeSteps.map(step => <p key={step} className="text-[13px] text-muted-foreground">{step}</p>)}
        </div>
      </motion.div>
    </div>
  );
}
