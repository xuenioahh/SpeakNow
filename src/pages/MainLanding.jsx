import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, LogOut, Mic, Monitor, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

const ENTRY_CARDS = [
  {
    to: "/presentation",
    icon: Monitor,
    title: "Presentation Practice",
    cta: "Enter Presentation",
    subtitle: "Slides, rehearsal, live coaching",
    description: "Open your deck, rehearse page by page, and keep the whole delivery controlled from start to finish.",
    highlights: ["Structured flow", "Live feedback", "Session summary"],
    indexLabel: "01",
    accent: "from-amber-500 to-orange-600",
    glow: "bg-amber-500/20",
    panel: "from-amber-400/28 via-orange-500/16 to-rose-500/8",
    border: "border-amber-300/18",
  },
  {
    to: "/voice",
    icon: Mic,
    title: "Scenario Speaking",
    cta: "Enter Scenario",
    subtitle: "Role-play, fluency, interaction",
    description: "Step into realistic conversations and build smoother, more confident spoken English through guided exchange.",
    highlights: ["Dialogue practice", "Smart follow-up", "Speaking feedback"],
    indexLabel: "02",
    accent: "from-cyan-500 to-blue-600",
    glow: "bg-blue-500/20",
    panel: "from-cyan-400/24 via-blue-500/16 to-violet-500/8",
    border: "border-cyan-300/18",
  },
];

export default function MainLanding() {
  const { user, isAdmin, logout } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    setShowSplash(true);
    setShowContent(false);

    const revealTimer = window.setTimeout(() => {
      setShowContent(true);
    }, 1080);

    const hideSplashTimer = window.setTimeout(() => {
      setShowSplash(false);
    }, 1450);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(hideSplashTimer);
    };
  }, []);

  return (
    <div className="min-h-screen pb-10 relative overflow-hidden bg-[#171717]">
      <AnimatePresence>
        {showSplash ? (
          <motion.div
            key="landing-splash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.72, ease: "easeInOut" } }}
            className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-[#171717]"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-[6%] top-[-8%] h-[32%] rounded-full bg-violet-500/28 blur-[88px]" />
              <div className="absolute inset-x-[16%] top-[18%] h-[24%] rounded-full bg-indigo-400/18 blur-[96px]" />
              <div className="absolute inset-x-[18%] bottom-[10%] h-[28%] rounded-full bg-cyan-400/10 blur-[100px]" />
            </div>
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.82 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1.15, ease: [0.18, 0.9, 0.2, 1] }}
              className="relative text-center"
            >
              <p className="text-[clamp(5.2rem,18vw,10rem)] leading-[0.8] font-bold font-space tracking-[-0.08em] text-white drop-shadow-[0_20px_40px_rgba(99,102,241,0.18)]">
                Speak
              </p>
              <p className="text-[clamp(5.2rem,18vw,10rem)] leading-[0.8] font-bold font-space tracking-[-0.08em] text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-violet-200 to-cyan-200">
                Now
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-x-[10%] top-[-8%] h-[30%] rounded-full bg-violet-500/26 blur-[82px]" />
        <div className="absolute inset-x-[14%] top-[14%] h-[34%] rounded-full bg-indigo-400/18 blur-[84px]" />
        <div className="absolute inset-x-[22%] top-[34%] h-[20%] rounded-full bg-cyan-400/12 blur-[90px]" />
        <div className="absolute inset-x-[14%] bottom-[10%] h-[28%] rounded-full bg-amber-400/22 blur-[78px]" />
        <div className="absolute inset-x-[6%] bottom-[-10%] h-[26%] rounded-full bg-violet-500/12 blur-[88px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),rgba(0,0,0,0)_60%)]" />
      </div>

      <motion.div
        initial={false}
        animate={{
          opacity: showContent ? 1 : 0,
          y: showContent ? 0 : 18,
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`relative px-4 pt-4 space-y-4 ${showContent ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <motion.div
          initial={false}
          animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : -12 }}
          className="glass rounded-[30px] px-5 pt-5 pb-6 overflow-hidden"
        >
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[44px] leading-none font-bold font-space tracking-[-0.04em] text-foreground">
                Speak Now
              </p>
              <p className="text-sm text-foreground/70 mt-3">
                {user?.full_name || "User"} · {user?.email || "unknown"}
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/45 mt-2">
                {isAdmin ? "Admin access enabled" : "Standard learner access"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout(true)}
                className="rounded-2xl text-foreground/70 hover:text-foreground hover:bg-white/10"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </motion.div>

        {isAdmin ? (
          <motion.div
            initial={false}
            animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 12 }}
            transition={{ delay: showContent ? 0.05 : 0 }}
          >
            <Link to="/admin" className="block">
              <div className="glass rounded-[30px] p-5 relative overflow-hidden border border-emerald-300/18 bg-gradient-to-b from-emerald-400/24 via-teal-500/14 to-cyan-500/8">
                <div className="absolute inset-0 bg-emerald-500/12" />
                <div className="absolute right-[-10%] top-[-10%] w-36 h-36 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-[12px] uppercase tracking-[0.18em] text-foreground/55">Admin Portal</p>
                      <h2 className="text-[26px] leading-tight font-semibold font-space text-foreground mt-2">
                        Open Admin Dashboard
                      </h2>
                      <p className="text-[14px] text-foreground/78 mt-2">
                        Review registrations, events, saved sessions, and admin access settings.
                      </p>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="w-5 h-5 text-foreground/70" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 pt-1">
          {ENTRY_CARDS.map(({ to, icon: Icon, title, cta, subtitle, description, highlights, indexLabel, accent, glow, panel, border }, index) => (
            <motion.div
              key={to}
              initial={false}
              animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 18 }}
              transition={{ delay: showContent ? 0.08 * (index + 1) : 0 }}
            >
              <Link to={to} className="block">
                <div className={`glass rounded-[32px] p-5 relative overflow-hidden min-h-[282px] bg-gradient-to-b ${panel} ${border} speaknow-entry-card`}>
                  <div className={`absolute inset-0 ${glow} opacity-70`} />
                  <div className="absolute inset-x-5 top-4 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  <div className="absolute right-[-10%] top-[-8%] w-40 h-40 rounded-full bg-white/8 blur-3xl" />
                  <div className="absolute right-5 top-5 text-[54px] leading-none font-space font-bold tracking-[-0.08em] text-white/8">
                    {indexLabel}
                  </div>
                  <div className="relative h-full flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">{subtitle}</p>
                        <h2 className="mt-4 max-w-[12rem] text-[30px] leading-[1.02] font-semibold font-space text-foreground">
                          {title}
                        </h2>
                      </div>
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div className={`w-14 h-14 rounded-[18px] bg-gradient-to-br ${accent} flex items-center justify-center shadow-[0_14px_30px_rgba(15,23,42,0.28)]`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${accent} opacity-90`} />
                      </div>
                    </div>

                    <div className="mt-7">
                      <p className="max-w-[26rem] text-[15px] leading-relaxed text-foreground/76">
                        {description}
                      </p>
                    </div>

                    <div className="mt-auto pt-7 space-y-5">
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {highlights.map((item) => (
                          <span key={item} className="speaknow-entry-meta">
                            {item}
                          </span>
                        ))}
                      </div>
                      <div className="speaknow-entry-action">
                        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-white">
                          <Sparkles className="h-4 w-4 text-white/82" />
                          {cta}
                        </span>
                        <span className="speaknow-entry-action-arrow">
                          <ChevronRight className="h-5 w-5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
