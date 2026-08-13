import { useEffect } from "react";
import { HazriUpdater } from "@/lib/native/updater";
import { isAndroidApp } from "@/lib/platform";

export function GitHubApkUpdater() {
  useEffect(() => {
    if (!isAndroidApp()) return;
    void HazriUpdater.checkForUpdate().catch(() => undefined);
  }, []);

  return null;
}
