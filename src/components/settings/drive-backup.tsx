import { useEffect, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Cloud, X } from "lucide-react";
import {
  describePhase,
  dismissBackupReminder,
  getBackupPhase,
  getDriveStatus,
  hydrateDriveStatus,
  shouldShowBackupReminder,
  subscribeDrive,
} from "@/lib/drive/service";

/** Compact Settings entry that opens the dedicated Google Drive page. */
export function DriveBackupCard() {
  const status = useSyncExternalStore(subscribeDrive, getDriveStatus, getDriveStatus);

  useEffect(() => {
    hydrateDriveStatus();
  }, []);

  const phase = getBackupPhase(status);
  const subtitle = !status.configured
    ? "Not configured in this build"
    : status.connected
      ? `${status.account ?? "Connected"} · ${describePhase(phase)}`
      : "Not connected — tap to set up";

  const reminder = shouldShowBackupReminder(status);

  return (
    <section
      data-tour="drive-backup"
      className="drive-accent-border rounded-3xl overflow-hidden p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]"
    >
      <div className="rounded-3xl bg-card border border-border dark:border-transparent dark:bg-[#111111]">
        <Link to="/drive-backup" className="block p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10">
              <Cloud className="h-4 w-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium">Google Drive backup</div>
              <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </Link>

        {reminder && (
          <div className="flex items-start gap-2 px-5 pb-4 -mt-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
              No Drive backup in the last 7 days. Your data is safe on this
              device — reconnect whenever you want to resume backup.
            </p>
            <button
              type="button"
              onClick={dismissBackupReminder}
              aria-label="Dismiss backup reminder"
              className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-muted-foreground shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
