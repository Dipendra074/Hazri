/**
 * Thin wrapper around the Storage API for quota checks and persistence.
 * Phase 2: exposed for future UI to warn before large local writes.
 */

export interface QuotaSnapshot {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
}

function hasStorageManager(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined"
  );
}

/**
 * Request that the browser mark the origin's storage as persistent. Best-effort:
 * some browsers grant automatically, others prompt, some ignore.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!hasStorageManager() || typeof navigator.storage.persist !== "function") {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!hasStorageManager() || typeof navigator.storage.persisted !== "function") {
    return false;
  }
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function getQuotaSnapshot(): Promise<QuotaSnapshot> {
  if (!hasStorageManager() || typeof navigator.storage.estimate !== "function") {
    return { supported: false, usageBytes: null, quotaBytes: null, usageRatio: null };
  }
  try {
    const est = await navigator.storage.estimate();
    const usage = typeof est.usage === "number" ? est.usage : null;
    const quota = typeof est.quota === "number" ? est.quota : null;
    return {
      supported: true,
      usageBytes: usage,
      quotaBytes: quota,
      usageRatio: usage != null && quota && quota > 0 ? usage / quota : null,
    };
  } catch {
    return { supported: false, usageBytes: null, quotaBytes: null, usageRatio: null };
  }
}

/**
 * Guardrail for callers about to write a large blob. Returns true when the
 * write should proceed, false when the origin is close to its quota.
 */
export async function hasHeadroomFor(bytes: number, safetyBytes = 10 * 1024 * 1024): Promise<boolean> {
  const snap = await getQuotaSnapshot();
  if (!snap.supported || snap.usageBytes == null || snap.quotaBytes == null) {
    return true; // unknown -> optimistic
  }
  return snap.usageBytes + bytes + safetyBytes <= snap.quotaBytes;
}