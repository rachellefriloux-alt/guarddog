import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ThemeChoice = "light" | "dark" | "system";

interface ThemeContextValue {
  /** What the user picked. */
  theme: ThemeChoice;
  /** What's actually applied right now (resolves "system" against the OS). */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeChoice) => void;
}

const STORAGE_KEY = "guarddog.theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStored(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  // Backwards-compatible: the previous app stored a boolean under "darkMode".
  const legacy = window.localStorage.getItem("darkMode");
  if (legacy === "true") return "dark";
  if (legacy === "false") return "light";
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the OS preference so "system" actually responds to the OS in real
  // time without a page reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  const setTheme = (next: ThemeChoice) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be disabled — non-fatal
    }
  };

  const value = useMemo<ThemeContextValue>(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used inside a <ThemeProvider>");
  }
  return ctx;
}
