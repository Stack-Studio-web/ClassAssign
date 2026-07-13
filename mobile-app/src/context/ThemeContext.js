import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { getColors } from "../theme/colors";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const value = useMemo(
    () => ({
      scheme: scheme === "dark" ? "dark" : "light",
      colors: getColors(scheme),
      isDark: scheme === "dark",
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      scheme: "light",
      colors: getColors("light"),
      isDark: false,
    };
  }
  return ctx;
}
