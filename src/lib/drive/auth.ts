/**
 * Google Drive authorization for Hazri backup.
 *
 * Uses Google Identity Services (GIS) token flow for public browser clients:
 * no client secret, no server, no Hazri account. The access token lives in
 * memory only — never in localStorage, never in a backup file, never logged.
 *
 * Persisted state is deliberately minimal:
 *   hazri:drive_connected → "1" when the user has authorized Drive backup.
 */

import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, isDriveConfigured } from "./config";
import { NativeDrive } from "@/lib/native/drive";
import { isAndroidApp } from "@/lib/platform";

const CONNECTED_KEY = "hazri:drive_connected";
const GIS_SRC = "https://accounts.google.com/gsi/client";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: unknown) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export class DriveAuthError extends Error {}

let accessToken: string | null = null;
let expiresAt = 0;
let tokenClient: TokenClient | null = null;
let gisPromise: Promise<void> | null = null;

const isBrowser = typeof window !== "undefined";

export function isDriveConnected(): boolean {
  if (!isBrowser) return false;
  try {
    return localStorage.getItem(CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function setConnected(v: boolean) {
  if (!isBrowser) return;
  try {
    if (v) localStorage.setItem(CONNECTED_KEY, "1");
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* storage unavailable */
  }
}

function loadGis(): Promise<void> {
  if (!isBrowser) return Promise.reject(new DriveAuthError("Unavailable"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    const el = existing ?? document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.defer = true;
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => {
      gisPromise = null;
      reject(new DriveAuthError("Could not reach Google. Check your connection."));
    });
    if (!existing) document.head.appendChild(el);
  });
  return gisPromise;
}

async function getTokenClient(): Promise<TokenClient> {
  if (!isDriveConfigured()) {
    throw new DriveAuthError("Google Drive backup isn't set up for this build yet.");
  }
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new DriveAuthError("Google sign-in is unavailable right now.");
  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {},
    });
  }
  return tokenClient;
}

function requestToken(interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    getTokenClient()
      .then((client) => {
        const timer = setTimeout(
          () =>
            reject(new DriveAuthError("Google Drive didn't respond. Please try again.")),
          interactive ? 120_000 : 20_000,
        );
        client.callback = (resp) => {
          clearTimeout(timer);
          if (resp.error || !resp.access_token) {
            reject(new DriveAuthError("Google Drive access was not granted."));
            return;
          }
          accessToken = resp.access_token;
          expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
          setConnected(true);
          resolve(accessToken);
        };
        client.requestAccessToken({ prompt: interactive ? "consent" : "" });
      })
      .catch(reject);
  });
}

/** Interactive connect — shows the Google consent screen. */
export async function connectDrive(): Promise<void> {
  if (isAndroidApp()) {
    await NativeDrive.connect();
    setConnected(true);
    return;
  }
  await requestToken(true);
}

/**
 * Explicit reconnect. Only ever called from a direct user tap on a
 * "Reconnect" control — never from backup, restore, or startup code.
 */
export async function reconnectDriveAuth(): Promise<void> {
  if (isAndroidApp()) {
    await NativeDrive.reconnect();
    setConnected(true);
    return;
  }
  await requestToken(true);
}

/** True when a usable access token is already in memory. */
export function hasLiveToken(): boolean {
  if (isAndroidApp()) return isDriveConnected();
  return Boolean(accessToken) && Date.now() < expiresAt;
}

/**
 * Returns the in-memory access token. NEVER opens Google's account chooser:
 * if the token is missing or expired, the caller must ask the user to
 * reconnect explicitly.
 */
export async function getAccessToken(): Promise<string> {
  if (isAndroidApp()) {
    throw new DriveAuthError("Android authorization stays inside the native app.");
  }
  if (accessToken && Date.now() < expiresAt) return accessToken;
  throw new DriveAuthError(
    isDriveConnected()
      ? "Google Drive needs to be reconnected before backing up."
      : "Google Drive isn't connected.",
  );
}


/** Forget the Drive authorization. Local data is never touched. */
export async function disconnectDrive(): Promise<void> {
  if (isAndroidApp()) {
    await NativeDrive.disconnect();
    setConnected(false);
    return;
  }
  const token = accessToken;
  accessToken = null;
  expiresAt = 0;
  setConnected(false);
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token);
    } catch {
      /* best effort */
    }
  }
}
