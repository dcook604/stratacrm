import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const KEY = "theme-preference";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "light"; // unchanged look unless someone opts in
}

export function applyTheme(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    applyTheme(pref);
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    if (pref !== "system") return;
    const mq = media();
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((p) => (p === "light" ? "dark" : p === "dark" ? "system" : "light"));
  }, []);

  return { pref, setPref, cycle };
}
