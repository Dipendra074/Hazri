import { registerPlugin } from "@capacitor/core";

interface HazriUpdaterPlugin {
  checkForUpdate(): Promise<{ status: "current" | "notified" | "skipped" }>;
}

export const HazriUpdater = registerPlugin<HazriUpdaterPlugin>("HazriUpdater");
