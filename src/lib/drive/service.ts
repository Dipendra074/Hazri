/**
 * Google Drive backup service.
 *
 * Rules:
 * - IndexedDB stays authoritative. Drive is a copy, never a source of truth
 *   unless the user explicitly restores.
 * - A backup is a plain JSON export produced by src/lib/backup.ts, so a
 *   Drive backup and a manual file backup are the same format.
 * - Automatic backups are opt-in, debounced, skipped while offline, and never
 *   block the UI.
 * - Only MAX_BACKUPS versions are kept. A new version is uploaded and
 *   verified first; only then is the oldest extra version deleted.
 */

import {
  exportGuestBackup,
  parseAndVerifyBackup,
  replaceGuestBackup,
  summarizeBackup,
  type BackupFile,
} from "@/lib/backup";
import { getActiveSession } from "@/lib/session";
import { toUserMessage } from "@/lib/errors";
import {
  AUTO_BACKUP_IDLE_MS,
  BACKUP_FILE_PREFIX,
  MAX_BACKUPS,
  isDriveConfigured,
} from "./config";
import {
  DriveAuthError,
  connectDrive,
  disconnectDrive,
  hasLiveToken,
  isDriveConnected,
  reconnectDriveAuth,
} from "./auth";
import {
  deleteBackup,
  downloadBackup,
  getBackupMeta,
  getDriveAccountEmail,
  listBackups,
  uploadBackup,
  type DriveBackupFileMeta,
} from "./api";
import { NativeDrive } from "@/lib/native/drive";
import { isAndroidApp } from "@/lib/platform";

const AUTO_KEY = "hazri:drive_auto";
const FREQ_KEY = "hazri:drive_freq";
const LAST_KEY = "hazri:drive_last_backup";
const LAST_AUTO_KEY = "hazri:drive_last_auto";
const PENDING_KEY = "hazri:drive_pending";
const EMAIL_KEY = "hazri:drive_account";
const REMINDER_KEY = "hazri:drive_reminder_dismissed";

/** At most one subtle reminder per 7 days, and only after 7 quiet days. */
export const REMINDER_INTERVAL_MS = 7 * 86_400_000;

export type DriveSyncState = "idle" | "working" | "error";
export type DriveFrequency = "daily" | "weekly";

export type DriveBackupPhase =
  | "not_connected"
  | "up_to_date"
  | "pending"
  | "working"
  | "offline"
  | "failed"
  | "paused";


export interface DriveStatus {
  configured: boolean;
  connected: boolean;
  account: string | null;
  autoBackup: boolean;
  frequency: DriveFrequency;
  pending: boolean;
  syncing: DriveSyncState;
  lastBackupAt: number | null;
  latestVersionAt: number | null;
  versionCount: number | null;
  needsReconnect: boolean;
  lastError: string | null;
}

const isBrowser = typeof window !== "undefined";

const DAY_MS = 86_400_000;

export function intervalFor(freq: DriveFrequency) {
  return freq === "weekly" ? 7 * DAY_MS : DAY_MS;
}

function requireOwnerId(): string {
  const id = getActiveSession().userId;
  if (!id) throw new Error("Local data isn't ready yet. Try again in a moment.");
  return id;
}

function read(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (!isBrowser) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

let state: DriveStatus = {
  configured: isDriveConfigured(),
  connected: false,
  account: null,
  autoBackup: false,
  frequency: "daily",
  pending: false,
  syncing: "idle",
  lastBackupAt: null,
  latestVersionAt: null,
  versionCount: null,
  needsReconnect: false,
  lastError: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function set(patch: Partial<DriveStatus>) {
  state = { ...state, ...patch };
  emit();
}

export function getDriveStatus(): DriveStatus {
  return state;
}

export function subscribeDrive(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBackupPhase(s: DriveStatus = state): DriveBackupPhase {
  if (!s.connected) return "not_connected";
  if (s.syncing === "working") return "working";
  if (s.needsReconnect) return "paused";
  if (isBrowser && navigator.onLine === false) return "offline";
  if (s.syncing === "error") return "failed";
  if (s.pending) return "pending";
  return "up_to_date";
}

export function describePhase(phase: DriveBackupPhase): string {
  switch (phase) {
    case "working":
      return "Backing up…";
    case "pending":
      return "Changes waiting";
    case "offline":
      return "Offline";
    case "failed":
      return "Backup failed";
    case "paused":
      return "Backup paused";
    case "not_connected":
      return "Not connected";
    default:
      return "Up to date";
  }
}

/** True when Drive metadata on screen is cached, not Drive-confirmed. */
export function isMetadataStale(s: DriveStatus = state): boolean {
  return s.connected && s.needsReconnect;
}

/** True when a usable access token exists right now (no popup, no network). */
export function hasAuthorization(): boolean {
  return isAndroidApp() ? state.connected : hasLiveToken();
}


/**
 * Reminder policy: at most one subtle reminder, and only when Drive is
 * connected, paused, and no verified backup has landed for 7 days.
 */
export function shouldShowBackupReminder(s: DriveStatus = state): boolean {
  if (!s.connected || !s.needsReconnect) return false;
  const dismissed = Number(read(REMINDER_KEY) ?? "");
  if (Number.isFinite(dismissed) && Date.now() - dismissed < REMINDER_INTERVAL_MS) {
    return false;
  }
  const last = s.lastBackupAt ?? 0;
  return Date.now() - last >= REMINDER_INTERVAL_MS;
}

/** Dismisses the reminder for another 7 days. */
export function dismissBackupReminder() {
  write(REMINDER_KEY, String(Date.now()));
  emit();
}

/** Reads persisted flags. Safe to call repeatedly. */
export async function hydrateDriveStatus(): Promise<void> {
  if (!isBrowser) return;
  if (isAndroidApp()) {
    try {
      set(await NativeDrive.getStatus());
    } catch {
      set({
        configured: true,
        syncing: "error",
        lastError: "Android backup status is temporarily unavailable.",
      });
    }
    return;
  }
  const last = Number(read(LAST_KEY) ?? "");
  set({
    configured: isDriveConfigured(),
    connected: isDriveConnected(),
    account: read(EMAIL_KEY),
    autoBackup: read(AUTO_KEY) === "1",
    frequency: read(FREQ_KEY) === "weekly" ? "weekly" : "daily",
    pending: read(PENDING_KEY) === "1",
    needsReconnect: isDriveConnected() && !hasLiveToken(),
    lastBackupAt: Number.isFinite(last) && last > 0 ? last : null,
  });
}


/* -------------------------------------------------------------------------- */
/* connect / disconnect                                                       */
/* -------------------------------------------------------------------------- */

export async function connect(): Promise<void> {
  set({ syncing: "working", lastError: null });
  try {
    await connectDrive();
    const account = await getDriveAccountEmail();
    write(EMAIL_KEY, account);
    set({ connected: true, account, syncing: "idle", needsReconnect: false });
    void refreshVersions();
  } catch (err) {
    set({
      syncing: "error",
      lastError: toUserMessage(err, "Google Drive could not be connected."),
    });
    throw new Error(toUserMessage(err, "Google Drive could not be connected."));
  }
}

/**
 * Explicit reconnect. Only call this from a direct user tap on a
 * "Reconnect Google Drive" control.
 */
export async function reconnect(): Promise<void> {
  set({ syncing: "working", lastError: null });
  try {
    await reconnectDriveAuth();
    const account = (await getDriveAccountEmail()) ?? read(EMAIL_KEY);
    write(EMAIL_KEY, account);
    write(REMINDER_KEY, null);
    set({ connected: true, account, syncing: "idle", needsReconnect: false });
    void refreshVersions();
    // Resume whatever was waiting while backup was paused.
    if (state.pending && state.autoBackup) {
      try {
        await backupNow();
        write(LAST_AUTO_KEY, String(Date.now()));
      } catch {
        /* stays pending; never blocks the reconnect result */
      }
    }
  } catch (err) {
    const message = toUserMessage(err, "Google Drive could not be reconnected.");
    set({ syncing: "error", lastError: message });
    throw new Error(message);
  }
}

const RECONNECT_MESSAGE =
  "Google Drive needs to be reconnected before continuing.";

/** Guard used by every non-interactive Drive operation. */
function requireLiveToken() {
  if (hasAuthorization()) return;
  set({ needsReconnect: true, syncing: "idle" });
  throw new DriveAuthError(RECONNECT_MESSAGE);
}


/** Disconnects Drive only. Local data is never deleted. */
export async function disconnect(): Promise<void> {
  await disconnectDrive();
  write(AUTO_KEY, null);
  write(EMAIL_KEY, null);
  set({
    connected: false,
    account: null,
    autoBackup: false,
    syncing: "idle",
    lastError: null,
    needsReconnect: false,
    versionCount: null,
    latestVersionAt: null,
  });
}

function syncNativeBackupSettings() {
  if (!isAndroidApp()) return;
  void NativeDrive.setAutomaticBackup({
    enabled: state.autoBackup,
    frequency: state.frequency,
  })
    .then((nativeStatus) => set(nativeStatus))
    .catch((err) =>
      set({
        syncing: "error",
        lastError: toUserMessage(err, "Automatic backup settings were not saved."),
      }),
    );
}

export function setAutoBackup(enabled: boolean) {
  write(AUTO_KEY, enabled ? "1" : null);
  set({ autoBackup: enabled });
  syncNativeBackupSettings();
  if (enabled) {
    if (isAndroidApp()) nativeDirty = true;
    markPendingFlag(true);
    scheduleAutoBackup();
  }
}

export function setFrequency(freq: DriveFrequency) {
  write(FREQ_KEY, freq);
  set({ frequency: freq });
  syncNativeBackupSettings();
}

/* -------------------------------------------------------------------------- */
/* backup                                                                     */
/* -------------------------------------------------------------------------- */

function fileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${BACKUP_FILE_PREFIX}-v2-${s}.json`;
}

function markPendingFlag(pending: boolean) {
  write(PENDING_KEY, pending ? "1" : null);
  set({ pending });
}

/** Deletes the oldest extras only after a fresh version is verified. */
async function rotate(keepId: string) {
  const files = await listBackups();
  const extra = files.filter((f) => f.id !== keepId).slice(MAX_BACKUPS - 1);
  for (const f of extra) {
    try {
      await deleteBackup(f.id);
    } catch {
      /* rotation is best-effort; never fail a good backup because of it */
    }
  }
}

export async function refreshVersions(): Promise<DriveBackupFileMeta[]> {
  if (!state.connected) return [];
  if (!hasAuthorization()) {
    set({ needsReconnect: true });
    return [];
  }
  try {
    const files = await listBackups();
    set({
      versionCount: files.length,
      latestVersionAt: files[0] ? new Date(files[0].createdTime).getTime() : null,
    });
    return files;
  } catch (err) {
    if (err instanceof DriveAuthError) set({ needsReconnect: true });
    return [];
  }
}

async function createBackupPayload() {
  console.info("[DriveBackup] DATA_EXPORT_START");
  const ownerId = requireOwnerId();
  const backup = await exportGuestBackup(ownerId);
  const payload = JSON.stringify(backup);
  await parseAndVerifyBackup(payload);
  console.info(`[DriveBackup] DATA_EXPORT_SUCCESS bytes=${payload.length}`);
  return payload;
}

function logBackupFailure(stage: string, error: unknown) {
  const candidate = error as { message?: unknown; code?: unknown } | null;
  const message = typeof candidate?.message === "string" ? candidate.message : "unknown";
  const code = typeof candidate?.code === "string" ? ` code=${candidate.code}` : "";
  console.error(`[DriveBackup] FAILED stage=${stage}${code} error=${message}`);
}

let inFlight: Promise<DriveBackupFileMeta> | null = null;

/** Explicit "Back up now". Throws with a user-safe message on failure. */
export async function backupNow(): Promise<DriveBackupFileMeta> {
  if (inFlight) return inFlight;
  const run = (async () => {
    set({ syncing: "working", lastError: null });
    let stage = "START";
    try {
      if (!isAndroidApp() && isBrowser && navigator.onLine === false) {
        throw new Error("You're offline. Backup will retry when you reconnect.");
      }
      requireLiveToken();
      stage = "DATA_EXPORT";
      const payload = await createBackupPayload();
      stage = "DRIVE_UPLOAD";
      console.info("[DriveBackup] DRIVE_UPLOAD_START");
      const meta = await uploadBackup(fileName(), payload);
      console.info("[DriveBackup] DRIVE_UPLOAD_SUCCESS");
      if (isAndroidApp()) {
        nativeDirty = false;
        await hydrateDriveStatus();
        return meta;
      }
      // Confirm the file really exists in Drive before rotating anything.
      const verified = await getBackupMeta(meta.id);

      const at = Date.now();
      write(LAST_KEY, String(at));
      markPendingFlag(false);
      set({
        syncing: "idle",
        lastBackupAt: at,
        connected: true,
        needsReconnect: false,
        latestVersionAt: new Date(verified.createdTime).getTime(),
      });
      await rotate(verified.id);
      await refreshVersions();
      return verified;
    } catch (err) {
      logBackupFailure(stage, err);
      if (isAndroidApp()) {
        await hydrateDriveStatus();
      } else if (err instanceof DriveAuthError) {
        set({ connected: isDriveConnected(), needsReconnect: true });
      }
      const message = toUserMessage(
        err,
        "Backup could not be completed. Your data is still safe on this device.",
      );
      set({ syncing: "error", lastError: message });
      throw new Error(message);
    } finally {
      inFlight = null;
    }
  })();
  inFlight = run;
  return run;
}

/* -------------------------------------------------------------------------- */
/* restore                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDriveBackups(): Promise<DriveBackupFileMeta[]> {
  requireLiveToken();
  const files = await listBackups();
  set({
    versionCount: files.length,
    latestVersionAt: files[0] ? new Date(files[0].createdTime).getTime() : null,
  });
  return files;
}

export async function previewDriveBackup(fileId: string): Promise<BackupFile> {
  requireLiveToken();
  try {
    return await parseAndVerifyBackup(await downloadBackup(fileId));
  } catch (err) {
    if (err instanceof DriveAuthError) throw err;
    throw new Error("The selected backup could not be verified.");
  }
}

export function describeBackup(backup: BackupFile) {
  return summarizeBackup(backup);
}

/**
 * Destructive restore — replaces local data with the chosen Drive backup.
 * `replaceGuestBackup` snapshots current data first and rolls back on failure.
 */
export async function restoreFromDrive(fileId: string) {
  const ownerId = requireOwnerId();
  set({ syncing: "working", lastError: null });
  try {
    const backup = await previewDriveBackup(fileId);
    const counts = await replaceGuestBackup(backup, ownerId);
    set({ syncing: "idle" });
    return counts;
  } catch (err) {
    const message = toUserMessage(err, "Restore failed. Your original data was kept.");
    set({ syncing: "error", lastError: message });
    throw new Error(message);
  }
}

/* -------------------------------------------------------------------------- */
/* automatic backup triggers                                                  */
/* -------------------------------------------------------------------------- */

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nativeDirty = false;

/** Called after any local data mutation. Cheap and non-blocking. */
export function markLocalChange() {
  if (!state.connected || !state.autoBackup) return;
  if (isAndroidApp()) nativeDirty = true;
  markPendingFlag(true);
  scheduleAutoBackup();
}

function scheduleAutoBackup() {
  if (!isBrowser) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void runAutoBackup();
  }, isAndroidApp() ? 1_500 : AUTO_BACKUP_IDLE_MS);
}

/**
 * Copies the latest validated IndexedDB export into Android internal storage.
 * WorkManager uploads this prepared snapshot later, even when the WebView is closed.
 */
export async function flushNativeDriveSnapshot(): Promise<void> {
  if (!isAndroidApp() || !state.connected || !state.autoBackup) return;
  if (!state.pending && !nativeDirty) return;
  try {
    const json = await createBackupPayload();
    const nativeStatus = await NativeDrive.prepareSnapshot({
      json,
      name: fileName(),
    });
    nativeDirty = false;
    set(nativeStatus);
  } catch (err) {
    set({
      syncing: "error",
      lastError: toUserMessage(
        err,
        "Backup could not be prepared. Your device data is unchanged.",
      ),
    });
  }
}

export async function retryNativeDriveBackup(): Promise<void> {
  if (!isAndroidApp()) return;
  await hydrateDriveStatus();
  if (nativeDirty || (state.connected && state.autoBackup && state.pending)) {
    await flushNativeDriveSnapshot();
  }
}

/** Scheduled automatic backups run at most once per daily/weekly window. */
function dueForSchedule(): boolean {
  const last = Number(read(LAST_AUTO_KEY) ?? "");
  if (!Number.isFinite(last) || last <= 0) return true;
  return Date.now() - last >= intervalFor(state.frequency);
}

async function runAutoBackup() {
  if (!state.connected || !state.autoBackup || (!state.pending && !nativeDirty)) return;
  if (isAndroidApp()) {
    await flushNativeDriveSnapshot();
    return;
  }
  if (isBrowser && navigator.onLine === false) return;
  if (!hasAuthorization()) {
    set({ needsReconnect: true });
    return;
  }
  if (!dueForSchedule()) return;
  try {
    await backupNow();
    write(LAST_AUTO_KEY, String(Date.now()));
  } catch {
    // Stays pending; retried on reconnect / next foreground.
  }
}

let wired = false;

/** Wires foreground + reconnect retries. Idempotent. */
export function initDriveBackup() {
  if (!isBrowser || wired) return;
  wired = true;

  const retry = () => {
    emit();
    if (state.pending) void runAutoBackup();
  };
  void hydrateDriveStatus().then(retry);
  window.addEventListener("online", retry);
  window.addEventListener("offline", () => emit());
  window.addEventListener("focus", retry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry();
  });
  retry();
}
