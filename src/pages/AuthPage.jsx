import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { localApi } from "@/api/localClient";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import LegalDialog from "@/components/LegalDialog";

const initialForm = {
  full_name: "",
  email: "",
  password: "",
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkUserAuth } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const isRegister = mode === "register";

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");
    setSubmitting(true);

    try {
      if (isRegister) {
        await localApi.auth.register(form);
        toast.success("Account created");
      } else {
        await localApi.auth.login(form);
        toast.success("Signed in");
      }
      await checkUserAuth();
      const target=new URLSearchParams(location.search).get('returnTo');
      navigate(target?.startsWith('/')&&!target.startsWith('//') ? target : '/');
    } catch (error) {
      setErrorMessage(error?.message || "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#171717] relative overflow-hidden flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[8%] top-[10%] h-44 w-44 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[10%] top-[18%] h-48 w-48 rounded-full bg-indigo-500/24 blur-3xl" />
        <div className="absolute inset-x-[20%] bottom-[6%] h-52 rounded-full bg-amber-500/16 blur-[90px]" />
      </div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md glass rounded-[24px] p-6 sm:p-8 border border-white/10"
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-[12px] uppercase tracking-[0.2em] text-foreground/55">Speak Now</p>
            <h1 className="text-3xl font-bold font-space text-foreground mt-2">
              {isRegister ? "Create Account" : "Sign In"}
            </h1>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <LockKeyhole className="w-5 h-5 text-white" />
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{isRegister ? "Practise exam speaking and everyday conversations. Save your feedback and retries across devices." : "Welcome back. Continue your speaking practice."}</p>
        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={submitting}>
          {isRegister && (
            <label className="block space-y-2">
              <span className="text-[12px] text-muted-foreground">Full name</span>
              <div className="relative">
                <UserRound className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  name="name"
                  autoComplete="name"
                  required
                  value={form.full_name}
                  onChange={(event) => updateField("full_name", event.target.value)}
                  className="pl-10 h-11 rounded-2xl bg-white/5 border-white/10"
                  placeholder="Your name"
                />
              </div>
            </label>
          )}

          <label className="block space-y-2">
            <span className="text-[12px] text-muted-foreground">Email</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                className="pl-10 h-11 rounded-2xl bg-white/5 border-white/10"
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-[12px] text-muted-foreground">Password</span>
            <div className="relative">
              <LockKeyhole className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="password"
                name="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                className="pl-10 h-11 rounded-2xl bg-white/5 border-white/10"
                placeholder="Enter your password"
              />
            </div>
          </label>

          {errorMessage && <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{errorMessage}</p>}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {submitting ? (isRegister ? "Creating account…" : "Signing in…") : (isRegister ? "Create account" : "Sign in")}
          </Button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            disabled={submitting}
            onClick={() => { setMode(isRegister ? "login" : "register"); setErrorMessage(""); }}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
          </button>
        </div>

        <div className="mt-5 border-t border-white/8 pt-4 text-center space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            By continuing, you acknowledge the educational-use disclaimer and the privacy notice for saved practice data.
          </p>
          <div className="flex items-center justify-center gap-4 text-[12px]">
            <LegalDialog type="disclaimer">
              <button type="button" className="text-primary hover:text-primary/80 transition-colors">
                Disclaimer
              </button>
            </LegalDialog>
            <LegalDialog type="privacy">
              <button type="button" className="text-primary hover:text-primary/80 transition-colors">
                Privacy Notice
              </button>
            </LegalDialog>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
