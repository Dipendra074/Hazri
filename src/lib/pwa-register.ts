// Native PWA registration in silent auto-update mode. A newly installed worker
// activates itself in the background; the page reloads only when the user is
// not mid-interaction, and a single "Hazri has been updated" toast is shown
// once after the new version is actually live.

const SW_URL = "/sw.js";
const ACTIVATION_TIMEOUT_MS = 15_000;
const PERIODIC_UPDATE_MS = 60_000;
const SAFE_RELOAD_POLL_MS = 3_000;
const UPDATED_FLAG_KEY = "hazri-pwa-updated";

let registration: ServiceWorkerRegistration | null = null;
let initPromise: Promise<void> | null = null;
let applyPromise: Promise<void> | null = null;
let reloadScheduled = false;
let reloadWatcherInstalled = false;
let controllerListenerInstalled = false;
let onlineListenerInstalled = false;
let updateCheckPromise: Promise<void> | null = null;
const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();
const watchedWorkers = new WeakSet<ServiceWorker>();

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) {
    return true;
  }
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterExistingAppWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((candidate) => {
          const url =
            candidate.active?.scriptURL ||
            candidate.installing?.scriptURL ||
            candidate.waiting?.scriptURL ||
            "";
          // Only touch our own app worker; leave messaging workers alone.
          return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
        })
        .map((candidate) => candidate.unregister()),
    );
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* "Updated" notice: written before the reload, read once after it.    */
/* ------------------------------------------------------------------ */

function markUpdatedPending() {
  try {
    window.sessionStorage.setItem(UPDATED_FLAG_KEY, "1");
  } catch {
    /* noop */
  }
}

/** Returns true at most once per completed update, then clears the flag. */
export function consumeUpdatedNotice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(UPDATED_FLAG_KEY) !== "1") return false;
    window.sessionStorage.removeItem(UPDATED_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Safe reload scheduling                                              */
/* ------------------------------------------------------------------ */

function hasUnsavedInteraction(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active) {
    const tag = active.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (active.isContentEditable) return true;
  }
  // Any open dialog/sheet/popover counts as an in-progress interaction.
  if (document.querySelector('[role="dialog"],[role="alertdialog"],[data-state="open"][role]')) {
    return true;
  }
  return false;
}

function isReloadSafe(): boolean {
  // A backgrounded tab is always safe to swap.
  if (document.visibilityState === "hidden") return true;
  return !hasUnsavedInteraction();
}

function doReload() {
  if (!reloadScheduled) return;
  markUpdatedPending();
  window.location.reload();
}

function scheduleSafeReload() {
  if (reloadScheduled) return;
  reloadScheduled = true;

  if (isReloadSafe()) {
    doReload();
    return;
  }

  if (reloadWatcherInstalled) return;
  reloadWatcherInstalled = true;

  const tryReload = () => {
    if (!reloadScheduled) return;
    if (!isReloadSafe()) return;
    window.clearInterval(poll);
    document.removeEventListener("visibilitychange", tryReload);
    doReload();
  };

  const poll = window.setInterval(tryReload, SAFE_RELOAD_POLL_MS);
  document.addEventListener("visibilitychange", tryReload);
}

function watchControllerChanges() {
  if (controllerListenerInstalled) return;
  controllerListenerInstalled = true;
  let current = navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const next = navigator.serviceWorker.controller;
    if (!next || next === current) return;
    const hadController = Boolean(current);
    current = next;
    // Only an actual replacement (not the first-ever install) needs a reload.
    if (hadController) scheduleSafeReload();
  });
}

function watchInstallingWorker(worker: ServiceWorker) {
  if (watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  const onStateChange = () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      // "installed" means the complete revisioned precache succeeded, so the
      // new version can be activated safely in the background.
      void applyUpdate();
    }
    if (worker.state === "redundant") {
      worker.removeEventListener("statechange", onStateChange);
    }
  };
  worker.addEventListener("statechange", onStateChange);
  onStateChange();
}

function watchRegistration(candidate: ServiceWorkerRegistration) {
  if (watchedRegistrations.has(candidate)) return;
  watchedRegistrations.add(candidate);
  if (candidate.waiting && navigator.serviceWorker.controller) void applyUpdate();
  if (candidate.installing) watchInstallingWorker(candidate.installing);
  candidate.addEventListener("updatefound", () => {
    if (candidate.installing) watchInstallingWorker(candidate.installing);
  });
}

export function checkForUpdate(): Promise<void> {
  // One in-flight check at a time; concurrent triggers share the same promise.
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = (async () => {
    if (!registration) {
      initPromise = null;
      await initPwa();
      return;
    }
    watchRegistration(registration);
    if (registration.waiting && navigator.serviceWorker.controller) void applyUpdate();
    try {
      await registration.update();
    } catch (error) {
      console.warn("[pwa] update check failed", error);
    }
  })().finally(() => {
    updateCheckPromise = null;
  });
  return updateCheckPromise;
}

function installUpdateTriggers() {
  if (onlineListenerInstalled) return;
  onlineListenerInstalled = true;

  const trigger = () => {
    void checkForUpdate();
  };

  window.addEventListener("online", trigger);
  window.addEventListener("focus", trigger);
  window.addEventListener("pageshow", trigger);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") trigger();
  });
  window.setInterval(trigger, PERIODIC_UPDATE_MS);
}

async function persistLocalStorageBestEffort() {
  // This requests durable origin storage only; it never reads, migrates, or
  // clears IndexedDB/guest data.
  try {
    if (navigator.storage && "persist" in navigator.storage) {
      const alreadyPersisted = await navigator.storage.persisted?.();
      if (!alreadyPersisted) await navigator.storage.persist();
    }
  } catch {
    /* noop */
  }
}

function waitForActivation(expectedWorker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (activated: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      expectedWorker.removeEventListener("statechange", check);
      resolve(activated);
    };

    const check = () => {
      if (expectedWorker.state === "activated") finish(true);
      else if (expectedWorker.state === "redundant") finish(false);
    };

    const timeout = window.setTimeout(() => finish(false), ACTIVATION_TIMEOUT_MS);
    expectedWorker.addEventListener("statechange", check);
    check();
  });
}

/** Activates a fully installed waiting worker in the background. */
export async function applyUpdate(): Promise<void> {
  if (reloadScheduled) return;
  if (applyPromise) return applyPromise;

  applyPromise = (async () => {
    await initPwa();
    const candidate = registration?.waiting;
    if (!candidate || candidate.state !== "installed") return;

    console.info("[pwa] installing update in background");
    candidate.postMessage({ type: "SKIP_WAITING" });

    if (!(await waitForActivation(candidate))) {
      console.warn("[pwa] waiting worker did not activate");
      return;
    }
    // controllerchange schedules the safe reload; this is the fallback for
    // browsers that claim clients without firing it promptly.
    scheduleSafeReload();
  })().finally(() => {
    applyPromise = null;
  });

  return applyPromise;
}

async function initializePwa(): Promise<boolean> {
  if (isRefusedContext()) {
    await unregisterExistingAppWorkers();
    return true;
  }
  if (!("serviceWorker" in navigator)) return true;

  watchControllerChanges();
  installUpdateTriggers();

  // Fast path: an existing registration may already hold an installed worker.
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) {
      registration = existing;
      watchRegistration(existing);
    }
  } catch {
    /* noop */
  }

  try {
    registration = await navigator.serviceWorker.register(SW_URL, {
      scope: "/",
      // Validate the top-level worker instead of allowing the HTTP cache to
      // delay discovery of a complete new deployment.
      updateViaCache: "none",
    });
  } catch (error) {
    // Offline startup can make the network update check fail even though an
    // installed registration is fully usable. Recover that local registration.
    if (!registration) {
      try {
        registration = (await navigator.serviceWorker.getRegistration("/")) ?? null;
      } catch {
        registration = null;
      }
    }
    console.warn("[pwa] registration/update check failed", error);
  }

  if (!registration) return false;
  watchRegistration(registration);
  // register() reuses an existing registration without always revalidating the
  // script, so force an explicit update check on open.
  void registration.update().catch((error) => {
    console.warn("[pwa] initial update check failed", error);
  });
  await persistLocalStorageBestEffort();
  return true;
}

export function initPwa(): Promise<void> {
  if (initPromise) return initPromise;

  const attempt = initializePwa();
  initPromise = attempt.then((initialized) => {
    // Permit the reconnect handler (or a later component mount) to retry only
    // when no installed registration could be recovered.
    if (!initialized) initPromise = null;
  });
  return initPromise;
}
