import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTour } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated/faqs")({
  component: FaqsPage,
});

const FAQS = [
  {
    q: "What is Hazri?",
    a: "Hazri is a smart attendance tracker built for students. It helps you keep tabs on subjects, required percentages, and upcoming classes.",
  },
  {
    q: "How is the required attendance calculated?",
    a: "Each subject stores a required percentage (default 75%). Hazri tells you how many classes you can miss while staying above it.",
  },
  {
    q: "Can I use Hazri offline?",
    a: "Basic tracking works offline. Sync and cloud backup require an internet connection and a signed-in account.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your attendance, subjects, and profile data are only visible to you and are protected by row-level security on the backend.",
  },
  {
    q: "How do I change my name or profile picture?",
    a: "Open the Profile section from the top-left button and edit your name or upload a new photo (max 2 MB, JPG/PNG/SVG/HEIF).",
  },
];

function FaqsPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">FAQs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick answers to the most common questions.
        </p>
      </div>
      <div className="rounded-3xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
        <div className="rounded-3xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 shrink-0">
            <Compass className="h-4 w-4 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Getting started / App tour</div>
            <div className="text-xs text-muted-foreground">Replay the guided walkthrough</div>
          </div>
          <Button
            size="sm"
            className="rounded-full shrink-0"
            onClick={() => {
              startTour();
              navigate({ to: "/today" });
            }}
          >
            Start
          </Button>
        </div>
      </div>

      <div className="rounded-3xl bg-card border border-border divide-y divide-border">
        {FAQS.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="cursor-pointer list-none font-medium flex items-center justify-between gap-3">
              <span>{item.q}</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-45 text-xl leading-none">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}