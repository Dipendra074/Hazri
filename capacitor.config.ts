import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hazri.app",
  appName: "Hazri",
  webDir: ".output/android",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0a0a12",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#0a0a12",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT",
      backgroundColor: "#00000000",
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
