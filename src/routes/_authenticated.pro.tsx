import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { playSound } from "@/lib/sound-effects";

export const Route = createFileRoute("/_authenticated/pro")({
  component: ProPage,
});

const FEATURES = [
  "Unlimited subjects & lab tracking",
  "Advanced analytics & attendance trends",
  "Custom accent color themes",
  "Cloud backup & multi-device sync",
  "All mini-games unlocked",
  "Priority support",
];

function ProPage() {
  const [plan, setPlan] = useState<"year" | "month">("year");
  useEffect(() => { void playSound("proPageOpen"); }, []);
  return (
    <div className="-mt-4 -mx-4 min-h-[calc(100vh-8rem)] px-6 pt-10 pb-40 bg-background relative overflow-hidden">
      <div className="absolute -top-40 inset-x-0 h-96 opacity-60 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, var(--color-primary), transparent 60%)" }} />
      <div className="relative max-w-md mx-auto">
        <h1 className="text-4xl font-bold tracking-tight text-center">
          Get the most out of <span className="bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">Hazri</span>
        </h1>
        <p className="text-center text-muted-foreground mt-3">A better way to stay on top of every class.</p>

        <ul className="mt-8 space-y-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm">{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <PlanCard active={plan === "year"} onClick={() => setPlan("year")} label="Yearly" price="₹100" per="/yr" badge="Save 72%" note="₹100 billed yearly" />
          <PlanCard active={plan === "month"} onClick={() => setPlan("month")} label="Monthly" price="₹30" per="/mo" note="Cancel anytime" />
        </div>

        <Button className="mt-6 w-full rounded-full h-14 text-base font-semibold bg-white text-black hover:bg-white/90" onClick={() => toast.info("Payments coming soon")}>
          Continue
        </Button>

        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <a href="#">Terms</a><a href="#">Restore</a><a href="#">Privacy</a>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ active, onClick, label, price, per, badge, note }: { active: boolean; onClick: () => void; label: string; price: string; per: string; badge?: string; note: string }) {
  return (
    <button onClick={onClick} className={`relative rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      {badge && (<div className="absolute -top-2 right-3 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">{badge}</div>)}
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span className="text-2xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{per}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{note}</div>
    </button>
  );
}