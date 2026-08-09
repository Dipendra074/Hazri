import { isAndroidApp } from "@/lib/platform";

/**
 * Google Drive backup configuration.
 *
 * The OAuth client ID is a PUBLIC value (browser/PWA "Web application"
 * client). There is no client secret anywhere in this app — Hazri uses the
 * Google Identity Services token flow, which is designed for public clients.
 *
 * Set VITE_GOOGLE_DRIVE_CLIENT_ID in your environment, or paste the client
 * ID into FALLBACK_CLIENT_ID below.
 */

const FALLBACK_CLIENT_ID =
  "156229460847-88t12p046nu5mb3m2loit2kpuu9l2g9l.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID: string = (
  (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined) ||
  FALLBACK_CLIENT_ID
).trim();

/**
 * Narrowest possible scope: access is limited to Hazri's own hidden
 * application data folder. Google never exposes the user's other files to
 * Hazri, and Hazri never asks for Gmail, Contacts, Calendar or full Drive.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/** Hidden, app-private Drive space. Not visible in the user's Drive UI. */
export const DRIVE_SPACE = "appDataFolder";

/** File name prefix for rotated backups. */
export const BACKUP_FILE_PREFIX = "hazri-backup";

/** How many backup versions to keep in Drive before rotating the oldest out. */
export const MAX_BACKUPS = 6;

/** Idle time after a local change before an automatic backup is attempted. */
export const AUTO_BACKUP_IDLE_MS = 25_000;

export function isDriveConfigured() {
  return isAndroidApp() || GOOGLE_CLIENT_ID.trim().length > 0;
}
