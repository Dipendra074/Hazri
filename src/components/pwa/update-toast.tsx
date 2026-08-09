import { useEffect } from "react";
import { toast } from "sonner";
import { initPwa, checkForUpdate, consumeUpdatedNotice } from "@/lib/pwa-register";
import { isNativePlatform } from "@/lib/platform";

export function PwaUpdater() {
  useEffect(() => {
    if (isNativePlatform()) return;
    // Silent auto-update: the worker installs and activates in the background.
    // The only user-visible signal is a one-time confirmation after reload.
    if (consumeUpdatedNotice()) {
      toast.success("Hazri has been updated", {
        id: "pwa-updated",
        duration: 4000,
      });
    }

    void initPwa().then(() => {
      void checkForUpdate();
    });
  }, []);

  return null;
}
