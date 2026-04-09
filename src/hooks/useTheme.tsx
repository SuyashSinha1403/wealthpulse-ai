import { createContext, useContext, useEffect, ReactNode } from "react";

type BaseTheme = "dark";
type AccentColor = "green";

interface ThemeContextValue {
  baseTheme: BaseTheme;
  accentColor: AccentColor;
  setBaseTheme: (_t: BaseTheme) => void;
  setAccentColor: (_a: AccentColor) => void;
  theme: string;
  setTheme: (_t: string) => void;
}

const noop = () => {};

const ThemeContext = createContext<ThemeContextValue>({
  baseTheme: "dark",
  accentColor: "green",
  setBaseTheme: noop,
  setAccentColor: noop,
  theme: "dark-green",
  setTheme: noop,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      "base-light",
      "base-grey",
      "base-dark",
      "accent-green",
      "accent-gold",
      "green-dark",
      "green-light",
      "gold-dark",
      "gold-light",
    );
    root.classList.add("base-dark", "accent-green");

    localStorage.setItem("wp-base-theme", "dark");
    localStorage.setItem("wp-accent", "green");
    localStorage.removeItem("wealthpulse-theme");
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        baseTheme: "dark",
        accentColor: "green",
        setBaseTheme: noop,
        setAccentColor: noop,
        theme: "dark-green",
        setTheme: noop,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
