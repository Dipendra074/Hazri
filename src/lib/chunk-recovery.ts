// One-shot recovery for failed dynamic module imports (e.g. a route chunk
// that no longer exists after a deployment changed its content hash).
//
// Behavior:
//   - Only reacts to genuine chunk-load errors (regex below).
//   - Never reloads while offline.
//   - Reloads at most once per browser session, guarded by sessionStorage.
//   - Never touches IndexedDB, localStorage, or Cache Storage.

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed/i;
const FLAG = "hazri:chunk-recovered";
let initialized = false;

function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return CHUNK_ERROR_RE.test(msg);
}

function tryRecover(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkError(err)) return false;

  // Surface the exact failing URL so it shows up in error reporting and
  // include the controller responsible for the current page.
  try {
    const msg = err instanceof Error ? err.message : String(err);
    const match = msg.match(/https?:\/\/\S+/);
    const controller = navigator.serviceWorker?.controller;

    console.error("[chunk-load] failed to load module", {
      url: match?.[0] ?? null,
      message: msg,
      online: navigator.onLine,
      controller: controller?.scriptURL ?? null,
      controllerState: controller?.state ?? null,
    });
  } catch {
    /* noop */
  }
  if (!navigator.onLine) return false;

  try {
    if (sessionStorage.getItem(FLAG) === "1") return false;
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Without a durable per-session guard, reloading could create a loop.
    return false;
  }

  window.location.reload();
  return true;
}

/** Attach client recovery listeners once. Safe to call during server startup. */
export function initializeChunkRecovery() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.addEventListener("error", (e) => tryRecover(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => tryRecover(e.reason));

  window.addEventListener("vite:preloadError", (e) => {
    if (tryRecover(e.payload)) {
      // Vite otherwise rethrows the rejected import while the reload is in
      // flight. Offline failures are deliberately left to the route boundary.
      e.preventDefault();
    }
  });
}
