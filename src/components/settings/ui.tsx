import { Link } from "@tanstack/react-router";
import { ChevronRight, ArrowLeft, type LucideIcon } from "lucide-react";

/** Profile-style grouped navigation list (used on the main Settings page). */
export function NavGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
        {title}
      </div>
      <div className="rounded-3xl bg-card border border-border divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function NavRow({
  to,
  icon: Icon,
  label,
  hint,
  dataTour,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  dataTour?: string;
}) {
  return (
    <Link to={to} data-tour={dataTour} className="flex items-center gap-3 p-4 hover:bg-secondary/50 transition">
      <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

/** Detailed settings card (used on subpages). */
export function SettingsCard({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={`rounded-3xl overflow-hidden bg-card border border-border p-5 ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Subpage header with a back link to the main Settings page. */
export function SubPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Link
        to="/settings"
        aria-label="Back to settings"
        className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}
