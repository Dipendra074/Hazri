import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  icon: Icon,
  title,
  body,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-4">
        <Icon className="h-7 w-7" />
      </div>
      <div className="inline-block rounded-full bg-secondary text-muted-foreground text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 mb-2">
        {phase}
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{body}</p>
    </div>
  );
}