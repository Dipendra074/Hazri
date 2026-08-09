import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "hazri-theme";

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(KEY);
  return v === "light" ? "light" : "dark";
}

export function setStoredTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("hazri-theme-change", { detail: theme }));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    const t = getStoredTheme();
    setThemeState(t);
    applyTheme(t);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail) setThemeState(detail);
    };
    window.addEventListener("hazri-theme-change", onChange);
    return () => window.removeEventListener("hazri-theme-change", onChange);
  }, []);
  return {
    theme,
    setTheme: (t: Theme) => {
      setThemeState(t);
      setStoredTheme(t);
    },
  };
}