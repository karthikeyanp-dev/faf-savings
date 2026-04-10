import { useState, useCallback } from 'react';

const STORAGE_KEY = 'faf-savings-dark-mode';

function getInitialDarkMode(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // localStorage not available
  }
  return false;
}

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    const isDark = getInitialDarkMode();
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return isDark;
  });

  const toggle = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage not available
      }
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  }, []);

  return { darkMode, toggle };
}
