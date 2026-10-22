import { lazy, Suspense, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AudioLines, History } from "lucide-react";
import { SCENARIOS } from "@/lib/scenarios";
import ScenarioCard from "@/components/voice/ScenarioCard";
import ModeSelector from "@/components/voice/ModeSelector";
import BottomNav from "@/components/BottomNav";
import PartnershipWindow from '@/components/PartnershipWindow';
import '@/scenario-studio.css';
const ScenarioStage = lazy(() => import('@/components/ScenarioStage'));

export default function Home() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [preview, setPreview] = useState(SCENARIOS.find(s => s.id === 'cafe'));

  const handleModeComplete = (selections) => {
    const params = new URLSearchParams({
      scenario: selectedScenario.id,
      mode: selections.mode,
      dialogMode: selections.dialogMode,
      scoring: selections.scoringStandard,
    });
    navigate(`/voice/setup?${params.toString()}`);
  };

  return (
    <div className="studio-page scenario-selection">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <AudioLines className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-space text-foreground">SpeakNow</h1>
            <p className="text-sm text-muted-foreground">Scenario speaking</p>
          </div>
        </motion.div>
      </div>

      {/* Section Title */}
      <div className="px-5 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Choose your next conversation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Explore a place. Meet your listener. Know what you want to say.
          </p>
        </div>
        <Link
          to="/voice/history"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors glass rounded-xl px-3 py-2"
        >
          <History className="w-3.5 h-3.5" />
          History
        </Link>
      </div>

      <section className="mx-4 mb-6 rounded-2xl border border-white/10 bg-[#242720] p-6">
        <p className="text-xs uppercase tracking-widest text-[#c6cfb2]">Casual Situation</p>
        <h2 className="mt-2 text-xl font-semibold">The Expression Lab</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Record a short video, explore your expression habits in context, then try one change. Your own words, your own comparison.</p>
        <Link to="/voice/casual-video" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#d6debd] px-5 text-sm font-medium text-[#20251b]">Try a speaking experiment</Link>
      </section>
      <section className="scenario-spotlight" aria-label="Scenario preview">
        <Suspense fallback={<div className="scenario-stage scenario-stage-loading">Preparing your scene…</div>}><ScenarioStage scenario={preview} /></Suspense>
        <motion.div key={preview.id} className="scenario-brief" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}><p className="scenario-kicker">STEP INSIDE · {preview.title}</p><h2>{preview.goalOriented.goal}</h2><p>{preview.goalOriented.context}</p><dl><div><dt>You are</dt><dd>{preview.goalOriented.userRole}</dd></div><div><dt>You are speaking to</dt><dd>{preview.aiRole}</dd></div></dl><div className="scenario-brief-actions"><button onClick={() => setSelectedScenario(preview)}>Start conversation →</button><Link to={`/voice/casual-video?scenario=${preview.id}`}>Practise on video</Link></div><span className="scenario-brief-footnote">Conversation opens a role-play. Video practice starts with your intention.</span></motion.div>
      </section>
      <div className="scenario-gallery-heading"><h3>12 places. Your next real conversation.</h3><p>Select a scene to explore its situation above.</p></div>
      <div className="scenario-gallery">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} selected={preview.id === scenario.id} onClick={() => {
            setPreview(scenario);
            document.querySelector('.scenario-spotlight')?.scrollIntoView({ behavior: 'auto', block: 'start' });
          }} />
        ))}
      </div>
      <PartnershipWindow />

      {/* Mode Selector Overlay */}
      {selectedScenario && (
        <ModeSelector
          scenario={selectedScenario}
          onComplete={handleModeComplete}
          onBack={() => setSelectedScenario(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}
