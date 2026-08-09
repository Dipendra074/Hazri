import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroidApp(): boolean {
  return isNativePlatform() && Capacitor.getPlatform() === "android";
}
