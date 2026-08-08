import React, { createContext, useContext, useEffect, useState } from "react";
import { palette, Theme, ThemeMode } from "@/src/constants/theme";
import { storage } from "@/src/utils/storage";

type Ctx = {
  mode: ThemeMode;
  theme: Theme;
  toggle: () => void;
  setModeValue: (next: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  const setModeValue = (next: ThemeMode) => {
    setMode(next);
    storage.setItem("theme_mode", next);
  };

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>("theme_mode", "dark");
      if (saved === "light" || saved === "dark") setMode(saved);
    })();
  }, []);

  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setModeValue(next);
  };

  return (
    <ThemeContext.Provider value={{ mode, theme: palette[mode], toggle, setModeValue }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside provider");
  return ctx;
};
