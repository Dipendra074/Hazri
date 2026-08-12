import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, Download, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  downloadGuestBackup,
  downloadTimetableBackup,
  readBackupFile,
  replaceGuestBackup,
  mergeGuestBackup,
  detectHasLocalData,
  getLocalDataStatus,
  type LocalDataStatus,
  summarizeBackup,
  BackupValidationError,
  type BackupFile,
  type MergeResult,
} from "@/lib/backup";
import { toUserMessage } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DriveBackupCard } from "@/components/settings/drive-backup";
import { SettingsCard, SubPageHeader } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/settings/data")({
  ssr: false,
  component: DataBackupPage,
});

type ImportStage =
  | { kind: "idle" }
  | { kind: "preview"; backup: BackupFile; hasLocal: boolean }
  | { kind: "confirm-replace"; backup: BackupFile }
  | { kind: "result-replace"; backup: BackupFile }
  | { kind: "result-merge"; backup: BackupFile; merge: MergeResult };

function DataBackupPage() {
  const session = useSession();
  const qc = useQueryClient();
  const [importStage, setImportStage] = useState<ImportStage>({ kind: "idle" });
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ownerId = session.userId;
  const [status, setStatus] = useState<LocalDataStatus | null>(null);
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!ownerId) return;
    getLocalDataStatus(ownerId)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [ownerId, statusTick]);

  async function handleExport(kind: "full" | "timetable") {
    if (!ownerId) return;
    setExportPickerOpen(false);
    setBusy("export");
    try {
      const name =
        kind === "timetable"
          ? await downloadTimetableBackup(ownerId)
          : await downloadGuestBackup(ownerId);
      toast.success(`${kind === "timetable" ? "Timetable" : "Backup"} created: ${name}`);
    } catch (e) {
      toast.error(toUserMessage(e, "Backup failed"));
    } finally {
      setBusy(null);
    }
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !ownerId) return;
    try {
      const backup = await readBackupFile(file);
      const hasLocal = await detectHasLocalData(ownerId);
      setImportStage({ kind: "preview", backup, hasLocal });
    } catch (err) {
      if (err instanceof BackupValidationError) toast.error(err.message);
      else toast.error("Could not read backup file");
    }
  }

  async function runReplace(backup: BackupFile) {
    if (!ownerId) return;
    setBusy("import");
    try {
      await qc.cancelQueries();
      await replaceGuestBackup(backup, ownerId);
      qc.clear();
      await qc.invalidateQueries();
      setImportStage({ kind: "result-replace", backup });
      setStatusTick((t) => t + 1);
      toast.success("Backup restored");
    } catch (e) {
      toast.error(toUserMessage(e, "Restore failed"));
      setImportStage({ kind: "idle" });
    } finally {
      setBusy(null);
    }
  }

  async function runMerge(backup: BackupFile) {
    if (!ownerId) return;
    setBusy("import");
    try {
      await qc.cancelQueries();
      const merge = await mergeGuestBackup(backup, ownerId);
      await qc.invalidateQueries();
      setImportStage({ kind: "result-merge", backup, merge });
      setStatusTick((t) => t + 1);
      toast.success(`Merged: +${merge.added} · skipped ${merge.skippedExisting}`);
    } catch (e) {
      toast.error(toUserMessage(e, "Merge failed"));
      setImportStage({ kind: "idle" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="Data & backup"
        description="Local storage, Google Drive and manual backups."
      />

      <SettingsCard className="space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" />
          <div className="font-medium">Stored on this device</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Hazri keeps all your data on this device. Nothing is uploaded unless you connect a backup.
        </p>
        <div className="text-xs text-muted-foreground">
          {status
            ? `${status.records} records · last updated ${
                status.lastUpdatedAt ? new Date(status.lastUpdatedAt).toLocaleString() : "—"
              }`
            : "Checking local data…"}
        </div>
      </SettingsCard>

      <DriveBackupCard />

      <SettingsCard className="space-y-3">
        <div>
          <div className="font-medium">Backup &amp; restore</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Export creates a compressed <code>.hazri</code> file with all your local data. Import
            accepts both <code>.hazri</code> and legacy
            <code> .json</code> backups and lets you merge or replace.
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full rounded-full h-11"
          onClick={() => setExportPickerOpen(true)}
          disabled={busy !== null}
        >
          <Download className="h-4 w-4 mr-2" />
          {busy === "export" ? "Preparing…" : "Export backup"}
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full h-11"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Upload className="h-4 w-4 mr-2" /> Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".hazri,.json,application/json,application/gzip"
          className="hidden"
          onChange={handlePickFile}
        />
      </SettingsCard>

      <Dialog open={exportPickerOpen} onOpenChange={setExportPickerOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Export backup</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">Full backup</p>
                  <p>All local data: timetable, attendance, projects, settings and images.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Timetable only</p>
                  <p>
                    Course names, icons, components and class timings only. Safe to share with
                    friends.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-col">
            <Button className="w-full rounded-full" onClick={() => handleExport("full")}>
              Create full backup
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => handleExport("timetable")}
            >
              Export timetable only
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-full"
              onClick={() => setExportPickerOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview + mode dialog */}
      <Dialog
        open={importStage.kind === "preview"}
        onOpenChange={(o) => !o && setImportStage({ kind: "idle" })}
      >
        <DialogContent className="sm:max-w-sm rounded-3xl">
          {importStage.kind === "preview" &&
            (() => {
              const s = summarizeBackup(importStage.backup);
              const hasLocal = importStage.hasLocal;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>Import backup</DialogTitle>
                    <DialogDescription asChild>
                      <div className="space-y-2 text-sm">
                        <div className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground space-y-0.5">
                          <div>Exported {new Date(s.exportedAt).toLocaleString()}</div>
                          <div>
                            App v{s.appVersion} · format v{s.formatVersion}
                          </div>
                          <div>
                            {importStage.backup.backupKind === "timetable"
                              ? "Timetable only · "
                              : ""}
                            {s.courses} courses · {s.scheduleEntries} slots · {s.attendanceEvents}{" "}
                            events · {s.holidays} holidays
                          </div>
                          <div>
                            {s.projects} projects · {s.todos} to-dos · {s.images} images
                          </div>
                        </div>
                        {importStage.backup.backupKind === "timetable" ? (
                          <p>
                            This will add the shared courses and class timings to this device. Your
                            attendance and other data will not change.
                          </p>
                        ) : hasLocal ? (
                          <>
                            <p className="text-destructive font-medium">
                              Hazri already contains local data.
                            </p>
                            <p>
                              Importing this backup may combine with or replace your current
                              courses, attendance history, schedules, projects, and settings.
                            </p>
                          </>
                        ) : (
                          <p>No existing local data. Safe to import.</p>
                        )}
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2 flex-col sm:flex-col">
                    {importStage.backup.backupKind === "timetable" ? (
                      <>
                        <Button
                          className="w-full rounded-full"
                          onClick={() => runMerge(importStage.backup)}
                          disabled={busy === "import"}
                        >
                          {busy === "import" ? "Adding…" : "Add timetable"}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full"
                          onClick={() => setImportStage({ kind: "idle" })}
                          disabled={busy === "import"}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : hasLocal ? (
                      <>
                        <Button
                          className="w-full rounded-full"
                          onClick={() => runMerge(importStage.backup)}
                          disabled={busy === "import"}
                        >
                          Merge data
                        </Button>
                        <Button
                          variant="destructive"
                          className="w-full rounded-full"
                          onClick={() =>
                            setImportStage({
                              kind: "confirm-replace",
                              backup: importStage.backup,
                            })
                          }
                          disabled={busy === "import"}
                        >
                          Replace current data
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full"
                          onClick={() => setImportStage({ kind: "idle" })}
                          disabled={busy === "import"}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          className="w-full rounded-full"
                          onClick={() => runReplace(importStage.backup)}
                          disabled={busy === "import"}
                        >
                          {busy === "import" ? "Restoring…" : "Restore backup"}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full"
                          onClick={() => setImportStage({ kind: "idle" })}
                          disabled={busy === "import"}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* Second confirm for destructive replace */}
      <Dialog
        open={importStage.kind === "confirm-replace"}
        onOpenChange={(o) => !o && setImportStage({ kind: "idle" })}
      >
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Replace all current Hazri data?</DialogTitle>
            <DialogDescription>
              Your current local data will be replaced with this backup. This cannot be undone
              unless you have another backup.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setImportStage({ kind: "idle" })}
              disabled={busy === "import"}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                importStage.kind === "confirm-replace" && runReplace(importStage.backup)
              }
              disabled={busy === "import"}
            >
              {busy === "import" ? "Restoring…" : "Replace and restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <Dialog
        open={importStage.kind === "result-replace" || importStage.kind === "result-merge"}
        onOpenChange={(o) => !o && setImportStage({ kind: "idle" })}
      >
        <DialogContent className="sm:max-w-sm rounded-3xl">
          {(importStage.kind === "result-replace" || importStage.kind === "result-merge") && (
            <>
              <DialogHeader>
                <DialogTitle>Backup imported successfully</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <div className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground space-y-0.5">
                      <div>Courses: {importStage.backup.counts.courses}</div>
                      <div>Schedule entries: {importStage.backup.counts.scheduleEntries}</div>
                      <div>Attendance records: {importStage.backup.counts.attendanceEvents}</div>
                      <div>Projects: {importStage.backup.counts.projects}</div>
                      <div>Todos: {importStage.backup.counts.todos}</div>
                    </div>
                    {importStage.kind === "result-merge" && (
                      <div className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground space-y-0.5">
                        <div>Added: {importStage.merge.added}</div>
                        <div>Skipped existing: {importStage.merge.skippedExisting}</div>
                        <div>Dropped (missing links): {importStage.merge.droppedDangling}</div>
                      </div>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  className="w-full rounded-full"
                  onClick={() => setImportStage({ kind: "idle" })}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
