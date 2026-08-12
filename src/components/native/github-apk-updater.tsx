import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isAndroidApp } from "@/lib/platform";

const LATEST_RELEASE_URL = "https://api.github.com/repos/Dipendra074/Hazri/releases/latest";
const RELEASE_PAGE_URL = "https://github.com/Dipendra074/Hazri/releases/latest";
const REQUEST_TIMEOUT_MS = 8_000;

type GitHubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  body?: unknown;
  assets?: unknown;
};

type AvailableUpdate = {
  versionLabel: string;
  notes: string;
  downloadUrl: string;
};

function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function isNewerVersion(releaseVersion: string, installedVersion: string): boolean {
  const release = parseVersion(releaseVersion);
  const installed = parseVersion(installedVersion);
  if (!release || !installed) return false;

  for (let index = 0; index < release.length; index += 1) {
    if (release[index] !== installed[index]) return release[index] > installed[index];
  }
  return false;
}

function getReleaseDownloadUrl(release: GitHubRelease): string | null {
  if (Array.isArray(release.assets)) {
    const apk = release.assets.find(
      (asset): asset is { name: string; browser_download_url: string } =>
        typeof asset === "object" &&
        asset !== null &&
        "name" in asset &&
        "browser_download_url" in asset &&
        typeof asset.name === "string" &&
        typeof asset.browser_download_url === "string" &&
        asset.name.toLowerCase().endsWith(".apk"),
    );
    if (apk) return apk.browser_download_url;
  }

  return typeof release.html_url === "string" ? release.html_url : RELEASE_PAGE_URL;
}

export function GitHubApkUpdater() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    if (!isAndroidApp()) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const checkForUpdate = async () => {
      try {
        const [appInfo, response] = await Promise.all([
          App.getInfo(),
          fetch(LATEST_RELEASE_URL, {
            headers: { Accept: "application/vnd.github+json" },
            signal: controller.signal,
          }),
        ]);
        if (!response.ok) return;

        const release: GitHubRelease = await response.json();
        if (
          typeof release.tag_name !== "string" ||
          !isNewerVersion(release.tag_name, appInfo.version)
        ) {
          return;
        }

        const downloadUrl = getReleaseDownloadUrl(release);
        if (!downloadUrl) return;

        setUpdate({
          versionLabel: release.tag_name,
          notes: typeof release.body === "string" ? release.body.trim() : "",
          downloadUrl,
        });
      } catch {
        // Checking for an update must never interfere with opening the app.
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void checkForUpdate();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const close = () => setUpdate(null);

  const openUpdate = () => {
    if (!update) return;
    close();
    void Browser.open({ url: update.downloadUrl });
  };

  return (
    <Dialog open={update !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>Hazri {update?.versionLabel} is now available.</DialogDescription>
        </DialogHeader>
        {update?.notes && (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {update.notes}
          </p>
        )}
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 rounded-full" onClick={close}>
            Later
          </Button>
          <Button className="flex-1 rounded-full" onClick={openUpdate}>
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
