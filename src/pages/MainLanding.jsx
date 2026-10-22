import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AudioLines, ChevronRight, LogOut, Mic, Monitor, Shield } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";

const ENTRY_CARDS = [
  {
    to: "/presentation",
    icon: Monitor,
    title: "Prepare a 5-minute presentation",
    cta: "Start your presentation",
    subtitle: "For international university students",
    description: "Record one attempt, review a suggested priority, then practise that part again. Slides are optional.",
    highlights: ["Record", "Choose one change", "Compare your own attempts"],
    indexLabel: "01",
    accent: "from-amber-500 to-orange-600",
    glow: "bg-amber-500/20",
    panel: "from-amber-400/28 via-orange-500/16 to-rose-500/8",
    border: "border-amber-300/18",
  },
  {
    to: "/voice",
    icon: Mic,
    title: "Optional conversation practice",
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

  return (
    <main className="min-h-dvh pb-24 relative overflow-x-hidden bg-[#171717] speaknow-shell">


      <div className="landing-ambient" aria-hidden="true" />

      <motion.div
        initial={false}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10 lg:px-8"
      >
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="glass speaknow-hero rounded-[30px] px-5 pt-5 pb-6 overflow-hidden sm:px-7 sm:pt-7"
        >
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="landing-hero-header flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/50">
                Prepare your important presentations
              </p>
              <h1 className="speaknow-brand-title mt-3 font-bold font-space text-foreground">
                Speak Now
              </h1>
              <p className="mt-3 text-sm text-foreground/70">Prepare your important presentations and improve the parts that matter.</p>
              <p className="landing-identity text-sm text-foreground/70 mt-3">
                {user?.full_name || "User"} · {user?.email || "unknown"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20">
                <AudioLines className="w-5 h-5 text-white" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                aria-label="Log out"
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
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Link to="/admin" className="block">
              <div className="landing-admin glass rounded-[30px] p-5 relative overflow-hidden border border-emerald-300/18 bg-gradient-to-b from-emerald-400/24 via-teal-500/14 to-cyan-500/8">
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

        <div className="mb-4 flex items-end justify-between gap-4 px-1 pt-3 sm:pt-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/45">Practice modes</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Improve the parts that matter.</h2>
          </div>
          <p className="hidden max-w-[15rem] text-right text-sm leading-relaxed text-foreground/55 sm:block">
            Your own first take and retry belong together. Review both recordings and decide what changed.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-2">
          {ENTRY_CARDS.map(({ to, icon: Icon, title, cta, subtitle, description, highlights, accent }) => (
            <motion.div
              key={to}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Link to={to} aria-label={`${cta}: ${title}`} className="block h-full speaknow-entry-link">
                <div className="glass p-5 sm:p-7 relative overflow-hidden speaknow-entry-card">
                  <div className="absolute inset-x-5 top-4 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  <div className="absolute right-[-10%] top-[-8%] w-40 h-40 rounded-full bg-white/8 blur-3xl" />
                  <div className="relative h-full flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">{subtitle}</p>
                        <h2 className="mt-4 max-w-[20rem] text-[30px] leading-[1.15] font-semibold font-space text-foreground">
                          {title}
                        </h2>
                      </div>
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div className={`w-14 h-14 rounded-[18px] bg-gradient-to-br ${accent} flex items-center justify-center shadow-[0_14px_30px_rgba(15,23,42,0.28)]`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
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
      <BottomNav />
    </main>
  );
}
