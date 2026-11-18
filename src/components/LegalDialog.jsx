import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const LEGAL_COPY = {
  disclaimer: {
    title: "Disclaimer",
    body: [
      "SpeakNow is an educational practice tool, not a certified language test or a medical, legal, or professional advisory service.",
      "Scores, summaries, and speaking feedback are AI-assisted estimates designed for practice only. They may be incomplete, inconsistent, or incorrect.",
      "Voice playback, speech recognition, and model responses depend on browser support, network conditions, and third-party AI providers.",
      "Users should not rely on this app as the sole basis for exam readiness, academic grading, or important personal decisions.",
    ],
  },
  privacy: {
    title: "Privacy Notice",
    body: [
      "SpeakNow stores account details, saved practice records, and admin analytics needed to operate the app.",
      "Presentation transcripts, speaking reports, and activity records may be processed by external AI providers configured by the team.",
      "Admin users can view usage data and saved session summaries through the admin dashboard.",
      "This project is a coursework product. Do not upload highly sensitive personal, financial, health, or confidential corporate information.",
    ],
  },
};

export default function LegalDialog({ type = "disclaimer", children }) {
  const content = LEGAL_COPY[type] || LEGAL_COPY.disclaimer;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg rounded-3xl border-slate-200 bg-background/95 text-foreground">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {content.body.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
