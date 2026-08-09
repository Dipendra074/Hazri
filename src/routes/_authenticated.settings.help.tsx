import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, HelpCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTour } from "@/lib/onboarding";
import { SettingsCard, SubPageHeader } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/settings/help")({
  ssr: false,
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="space-y-5">
      <SubPageHeader title="Help & support" description="Guides, answers and feedback." />

      <SettingsCard className="flex items-center gap-3">
        <Compass className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">Restart app tour</div>
          <div className="text-xs text-muted-foreground">
            Replay the guided walkthrough of Hazri
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full shrink-0"
          onClick={() => startTour()}
        >
          Restart
        </Button>
      </SettingsCard>

      <SettingsCard className="flex items-center gap-3">
        <HelpCircle className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">Help & FAQs</div>
          <div className="text-xs text-muted-foreground">Common questions</div>
        </div>
        <Link
          to="/faqs"
          className="rounded-full bg-secondary px-4 py-2 text-sm font-medium shrink-0"
        >
          Open
        </Link>
      </SettingsCard>

      <SettingsCard className="flex items-center gap-3">
        <MessageSquare className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">Feedback & bug report</div>
          <div className="text-xs text-muted-foreground">Ideas and issues</div>
        </div>
        <Link
          to="/feedback"
          className="rounded-full bg-secondary px-4 py-2 text-sm font-medium shrink-0"
        >
          Open
        </Link>
      </SettingsCard>
    </div>
  );
}
