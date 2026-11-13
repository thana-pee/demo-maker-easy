'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  themePref: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePref: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'demo_maker_easy_theme';

const ThemeContext = createContext<ThemeContextType>({
  themePref: 'light',
  resolvedTheme: 'light',
  setThemePref: () => {},
  toggleTheme: () => {},
});

function applyResolvedThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.classList.toggle('light', resolved === 'light');
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themePref, setThemePrefState] = useState<ThemePreference>('light');
  const [systemDark, setSystemDark] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rafId = requestAnimationFrame(() => {
      let nextPref: ThemePreference = 'light';
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          nextPref = saved;
        }
      } catch {
        // Ignore storage read errors in restricted contexts
      }
      const isDarkNow = getSystemDark();
      setThemePrefState(nextPref);
      setSystemDark(isDarkNow);
      const resolved: ResolvedTheme =
        nextPref === 'system' ? (isDarkNow ? 'dark' : 'light') : nextPref;
      applyResolvedThemeToDocument(resolved);
    });

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };

    mediaQuery?.addEventListener('change', handleMediaChange);
    return () => {
      cancelAnimationFrame(rafId);
      mediaQuery?.removeEventListener('change', handleMediaChange);
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;

  useEffect(() => {
    applyResolvedThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setThemePref = useCallback((pref: ThemePreference) => {
    setThemePrefState(pref);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      // Ignore storage write errors
    }
    const nextResolved: ResolvedTheme =
      pref === 'system' ? (getSystemDark() ? 'dark' : 'light') : pref;
    applyResolvedThemeToDocument(nextResolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemePref(next);
  }, [resolvedTheme, setThemePref]);

  return (
    <ThemeContext.Provider value={{ themePref, resolvedTheme, setThemePref, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  return useContext(ThemeContext);
};
