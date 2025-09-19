import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

/**
 * ThemeProvider
 * - Applies `.light-theme` or `.dark-theme` to document.documentElement
 * - Persists theme in localStorage under "theme"
 * - Falls back to prefers-color-scheme if no saved preference
 */
export function ThemeProvider({ children }) {
  const getInitialTheme = () => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {
      // ignore localStorage errors
    }

    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    }
    return "light";
  };

  const [theme, setThemeState] = useState(getInitialTheme);

  // Apply theme class to root element
// inside useEffect that runs on theme change
useEffect(() => {
  const root = document.documentElement;
  root.classList.remove("light-theme", "dark-theme");
  const cls = theme === "dark" ? "dark-theme" : "light-theme";
  root.classList.add(cls);

  // also set a data attribute which some libs/readers prefer
  root.setAttribute("data-theme", theme);

  // push a couple of "global" CSS variables to the computed style — useful if some styles read inline vars
  try {
    root.style.setProperty("--is-dark", theme === "dark" ? "1" : "0");
    // also expose two commonly used tokens in case some files reference them directly
    if (theme === "dark") {
      root.style.setProperty("--card-bg", "#071026");
      root.style.setProperty("--input-bg", "#0b1320");
    } else {
      root.style.setProperty("--card-bg", "#ffffff");
      root.style.setProperty("--input-bg", "#ffffff");
    }
    localStorage.setItem("theme", theme);
  } catch (e) {
    // ignore storage/style errors
  }
}, [theme]);


  const setTheme = (value) => {
    if (value !== "light" && value !== "dark") return;
    setThemeState(value);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
