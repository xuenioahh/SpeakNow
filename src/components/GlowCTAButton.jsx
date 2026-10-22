import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GlowCTAButton({
  children,
  className = "",
  glowClassName = "",
  arrowClassName = "",
  onMouseMove = undefined,
  onMouseLeave = undefined,
  ...props
}) {
  const glow = useRef(null);

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = `${event.clientX - rect.left}px`;
    const y = `${event.clientY - rect.top}px`;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) { glow.current?.style.setProperty("--glow-x", x); glow.current?.style.setProperty("--glow-y", y); }
    onMouseMove?.(event);
  };

  const handleMouseLeave = (event) => {
    glow.current?.style.setProperty("--glow-x", "50%");
    glow.current?.style.setProperty("--glow-y", "50%");
    onMouseLeave?.(event);
  };

  return (
    <Button
      {...props}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative isolate overflow-hidden rounded-[22px] border border-white/16 bg-white/10 px-5 py-3 text-white shadow-[0_18px_40px_rgba(15,23,42,0.24)] backdrop-blur-md",
        "before:absolute before:inset-[1px] before:rounded-[20px] before:bg-gradient-to-r before:from-white/14 before:via-transparent before:to-white/10 before:opacity-70 before:content-['']",
        className,
      )}
    >
      <span
        ref={glow}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100",
        )}
        style={{
          background: "radial-gradient(180px circle at var(--glow-x,50%) var(--glow-y,50%), rgba(255,255,255,0.28), rgba(255,255,255,0.08) 38%, transparent 72%)",
        }}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/6 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          glowClassName,
        )}
      />
      <span className="relative z-10 inline-flex items-center gap-3">
        <span>{children}</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/18 ring-1 ring-white/14 transition-transform duration-300 group-hover:translate-x-1">
          <ArrowRight className={cn("h-4 w-4 text-white", arrowClassName)} />
        </span>
      </span>
    </Button>
  );
}
