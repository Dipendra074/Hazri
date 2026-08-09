import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import {
  flushNativeDriveSnapshot,
  hydrateDriveStatus,
  retryNativeDriveBackup,
} from "@/lib/drive/service";
import { isAndroidApp } from "@/lib/platform";

function closeTopDialog(): boolean {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return false;
  dialog.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}

function updateStatusBar() {
  const lightTheme = document.documentElement.classList.contains("light");
  return StatusBar.setStyle({
    style: lightTheme ? StatusBarStyle.Dark : StatusBarStyle.Light,
  });
}

export function NativeRuntime() {
  const router = useRouter();

  useEffect(() => {
    if (!isAndroidApp()) return;

    document.documentElement.classList.add("hazri-native");
    void Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    void updateStatusBar();
    void SplashScreen.hide({ fadeOutDuration: 250 });
    void hydrateDriveStatus();

    const themeObserver = new MutationObserver(() => void updateStatusBar());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const backListener = App.addListener("backButton", ({ canGoBack }) => {
      if (closeTopDialog()) return;
      if (canGoBack) {
        router.history.back();
        return;
      }
      if (window.location.pathname !== "/today") {
        void router.navigate({ to: "/today", replace: true });
        return;
      }
      void App.exitApp();
    });

    const appStateListener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void hydrateDriveStatus();
        void retryNativeDriveBackup();
      } else {
        void flushNativeDriveSnapshot();
      }
    });

    const networkListener = Network.addListener("networkStatusChange", ({ connected }) => {
      window.dispatchEvent(new Event(connected ? "online" : "offline"));
      if (connected) void retryNativeDriveBackup();
    });

    const openExternalLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin) return;
      event.preventDefault();
      void Browser.open({ url: url.href });
    };
    document.addEventListener("click", openExternalLink, true);

    return () => {
      document.documentElement.classList.remove("hazri-native");
      themeObserver.disconnect();
      document.removeEventListener("click", openExternalLink, true);
      void backListener.then((listener) => listener.remove());
      void appStateListener.then((listener) => listener.remove());
      void networkListener.then((listener) => listener.remove());
    };
  }, [router]);

  return null;
}
