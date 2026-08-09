import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Cloud,
  CloudUpload,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toUserMessage } from "@/lib/errors";
import { MAX_BACKUPS } from "@/lib/drive/config";
import type { DriveBackupFileMeta } from "@/lib/drive/api";
import {
  backupNow,
  connect,
  describePhase,
  disconnect,
  getBackupPhase,
  getDriveStatus,
  hasAuthorization,
  hydrateDriveStatus,
  isMetadataStale,

  listDriveBackups,
  previewDriveBackup,
  reconnect,
  refreshVersions,
  restoreFromDrive,
  setAutoBackup,
  setFrequency,
  subscribeDrive,
  type DriveFrequency,
} from "@/lib/drive/service";
import type { BackupFile } from "@/lib/backup";
import { isAndroidApp } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/drive-backup")({
  head: () => ({
    meta: [
      { title: "Google Drive backup — Hazri" },
      {
        name: "description",
        content:
          "Connect Hazri to your private Google Drive app folder for automatic attendance backups and safe restore.",
      },
      { property: "og:title", content: "Google Drive backup — Hazri" },
      {
        property: "og:description",
        content:
          "Automatic backup and restore for Hazri, stored in your own private Google Drive app folder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriveBackupPage,
});

const card =
  "rounded-3xl overflow-hidden p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]";
const plate =
  "rounded-3xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-5";

function when(ts: number | null) {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  return new Date(ts).toLocaleString();
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

function SuccessBurst({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-primary animate-in zoom-in-95 fade-in duration-300">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15">
        <Check className="h-3.5 w-3.5" />
      </span>
      {label}
    </div>
  );
}

function DriveBackupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const status = useSyncExternalStore(subscribeDrive, getDriveStatus, getDriveStatus);
  const phase = getBackupPhase(status);
  const paused = phase === "paused";
  const stale = isMetadataStale(status);

  const [busy, setBusy] = useState<
    "connect" | "reconnect" | "backup" | "list" | "restore" | null
  >(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [files, setFiles] = useState<DriveBackupFileMeta[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [authAsk, setAuthAsk] = useState<"backup" | "restore" | null>(null);
  const [confirm, setConfirm] = useState<
    { file: DriveBackupFileMeta; backup: BackupFile } | null
  >(null);

  useEffect(() => {
    hydrateDriveStatus();
    void refreshVersions();
  }, []);

  const celebrate = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  }, []);

  const fail = useCallback((msg: string) => {
    toast.error(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  async function handleConnect() {
    setBusy("connect");
    try {
      await connect();
      celebrate("Google Drive connected");
    } catch (e) {
      fail(toUserMessage(e, "Google Drive could not be connected."));
    } finally {
      setBusy(null);
    }
  }

  async function handleReconnect() {
    setBusy("reconnect");
    try {
      await reconnect();
      celebrate("Google Drive reconnected");
      return true;
    } catch (e) {
      fail(toUserMessage(e, "Google Drive could not be reconnected."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function confirmReconnect() {
    const intent = authAsk;
    const ok = await handleReconnect();
    setAuthAsk(null);
    if (!ok) return;
    if (intent === "backup") await runBackup();
    if (intent === "restore") await loadVersions();
  }

  async function handleDisconnect() {
    await disconnect();
    setFiles(null);
    toast.success("Google Drive disconnected. Your local data is untouched.");
  }

  async function runBackup() {
    setBusy("backup");
    try {
      await backupNow();
      celebrate("Backup saved to Google Drive");
    } catch (e) {
      fail(
        toUserMessage(
          e,
          "Backup could not be completed. Your data is still safe on this device.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function handleBackupNow() {
    if (!hasAuthorization()) {
      setAuthAsk("backup");
      return;
    }
    void runBackup();
  }

  async function loadVersions() {
    setBusy("list");
    setPickerOpen(true);
    try {
      setFiles(await listDriveBackups());
    } catch (e) {
      setPickerOpen(false);
      fail(toUserMessage(e, "Could not read your Drive backups."));
    } finally {
      setBusy(null);
    }
  }

  function openPicker() {
    if (!hasAuthorization()) {
      setAuthAsk("restore");
      return;
    }
    void loadVersions();
  }

  async function choose(file: DriveBackupFileMeta) {
    setBusy("restore");
    try {
      const backup = await previewDriveBackup(file.id);
      setConfirm({ file, backup });
    } catch (e) {
      fail(toUserMessage(e, "The selected backup could not be verified."));
    } finally {
      setBusy(null);
    }
  }


  async function doRestore() {
    if (!confirm) return;
    setBusy("restore");
    try {
      await qc.cancelQueries();
      await restoreFromDrive(confirm.file.id);
      qc.clear();
      await qc.invalidateQueries();
      setConfirm(null);
      setPickerOpen(false);
      celebrate("Restored from Google Drive");
      await router.invalidate();
    } catch (e) {
      fail(toUserMessage(e, "Restore failed. Your original data was kept."));
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null || status.syncing === "working";

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.history.back()}
          aria-label="Go back"
          className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight flex-1">Google Drive</h1>
        {status.connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-xs font-medium text-muted-foreground rounded-full px-3 py-1.5 bg-secondary"
          >
            Disconnect
          </button>
        )}
      </header>

      <section className={card}>
        <div className={`${plate} space-y-3`}>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Google Drive automated backup</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Hazri keeps all your attendance data on this device. When you connect
            Google Drive, Hazri can also save backup copies into a hidden folder
            inside your own Google Drive.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            {[
              "Used only for backup and restore",
              "Hazri cannot see your normal Drive files",
              "This is not a Hazri account",
              "Your device storage stays the main copy",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {!status.configured ? (
        <section className={card}>
          <div className={`${plate} space-y-2`}>
            <div className="font-medium text-sm">
              Google Drive backup is not configured in this build.
            </div>
            <p className="text-xs text-muted-foreground">
              Manual export and import in Settings keep working, and your data
              stays safely on this device.
            </p>
          </div>
        </section>
      ) : (
        <section className={card}>
          <div
            className={`${plate} space-y-4 ${shake ? "otp-shake" : ""}`}
          >
            {flash && <SuccessBurst label={flash} />}

            {status.connected ? (
              <>
                <div className="rounded-2xl bg-secondary p-3 space-y-1.5">
                  <Row label="Account" value={status.account ?? "Google account"} />
                  <Row label="Status" value={describePhase(phase)} />
                  <Row label="Last backup" value={when(status.lastBackupAt)} />
                  <Row
                    label={stale ? "Latest version (last known)" : "Latest version"}
                    value={when(status.latestVersionAt ?? status.lastBackupAt)}
                  />
                  <Row
                    label={stale ? "Versions stored (last known)" : "Versions stored"}
                    value={`${status.versionCount ?? 0} of ${MAX_BACKUPS}`}
                  />
                </div>

                {paused && (
                  <div className="flex items-center gap-3 rounded-2xl bg-secondary p-3 animate-in fade-in duration-200">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">Drive backup paused</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Your data is safe on this device. Reconnect whenever you
                        want to resume Google Drive backup.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full shrink-0 bg-background"
                      onClick={handleReconnect}
                      disabled={busy !== null}
                    >
                      {busy === "reconnect" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {busy === "reconnect" ? "Resuming…" : "Resume"}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      Google Drive automated backup
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isAndroidApp()
                        ? "Runs through Android after changes, even when Hazri is closed."
                        : "Runs quietly after changes, while Hazri is open."}
                    </div>
                  </div>
                  <Switch
                    checked={status.autoBackup}
                    onCheckedChange={setAutoBackup}
                    aria-label="Google Drive automated backup"
                  />
                </div>

                {status.autoBackup && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-secondary">
                      {(["daily", "weekly"] as DriveFrequency[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          aria-pressed={status.frequency === f}
                          className={`py-2.5 rounded-xl text-sm font-medium capitalize transition ${
                            status.frequency === f
                              ? "bg-white text-foreground shadow-sm dark:bg-[#252525] dark:text-white"
                              : "text-muted-foreground"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      At most one scheduled backup{" "}
                      {status.frequency === "weekly" ? "every seven days" : "per day"}.{" "}
                      &quot;Back up now&quot; always works.{" "}
                      {isAndroidApp()
                        ? "Android waits for a network connection and retries safely in the background."
                        : "Browsers cannot tell Wi-Fi from mobile data, so scheduled backups run only while Hazri is open."}
                    </p>
                  </div>
                )}

                {status.lastError && !paused && (
                  <p className="text-xs text-destructive">{status.lastError}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Choose a Google account to authorize backups. Hazri never asks
                  for a password or client secret.
                </p>
                <Button
                  className="w-full rounded-full h-11"
                  onClick={handleConnect}
                  disabled={busy !== null}
                >
                  {busy === "connect" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4 mr-2" />
                  )}
                  {busy === "connect" ? "Connecting…" : "Connect Google Drive"}
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {status.configured && status.connected && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="rounded-full h-12"
            onClick={openPicker}
            disabled={working}
          >
            <Download className="h-4 w-4 mr-2" /> Restore
          </Button>
          <Button
            className="rounded-full h-12"
            onClick={handleBackupNow}
            disabled={working}
          >
            {busy === "backup" || status.syncing === "working" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4 mr-2" />
            )}
            {busy === "backup" ? "Backing up…" : "Back up now"}
          </Button>
        </div>
      )}

      <Dialog open={authAsk !== null} onOpenChange={(o) => !o && setAuthAsk(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Reconnect Google Drive?</DialogTitle>
            <DialogDescription>
              Google Drive needs to be reconnected before continuing. Your data
              stays safe on this device either way.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={() => setAuthAsk(null)}
            >
              Not now
            </Button>
            <Button
              className="flex-1 rounded-full"
              onClick={confirmReconnect}
              disabled={busy === "reconnect"}
            >
              {busy === "reconnect" && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={pickerOpen} onOpenChange={(o) => !o && setPickerOpen(false)}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Restore from Google Drive</DialogTitle>
            <DialogDescription>
              Choose a backup version. Nothing changes until you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {busy === "list" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading backups…
              </div>
            )}
            {files?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No backups in Drive yet.
              </p>
            )}
            {files?.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => choose(f)}
                disabled={busy === "restore"}
                className="w-full rounded-2xl bg-secondary p-3 text-left"
              >
                <div className="text-sm font-medium">
                  {new Date(f.createdTime).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(f.size) || "Backup"}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Replace data on this device?</DialogTitle>
            <DialogDescription>
              Hazri snapshots your current data first and rolls it back if the
              restore fails.
            </DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="rounded-2xl bg-secondary p-3 space-y-1.5">
              <Row
                label="Backup date"
                value={new Date(confirm.backup.exportedAt).toLocaleString()}
              />
              <Row label="App version" value={confirm.backup.appVersion} />
              <Row
                label="Records"
                value={String(
                  Object.values(confirm.backup.counts).reduce(
                    (a, b) => a + (b || 0),
                    0,
                  ),
                )}
              />
              <Row label="Size" value={formatSize(confirm.file.size) || "—"} />
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-full"
              onClick={doRestore}
              disabled={busy === "restore"}
            >
              {busy === "restore" && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
