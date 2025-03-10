'use client';

import { useEffect, useState } from "react";

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>();

  useEffect(() => {
    setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDarkMode(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isDarkMode;
}

export function useLocation() {
  const [loc, setLoc] = useState<Location>();

  useEffect(() => {
    setLoc(window.location);

    window.addEventListener('popstate', () => {
      setLoc(window.location);
    });
  }, []);

  return loc;
}

interface PageInfo {
  title?: string;
  navTitle: string;
  hasAudio?: boolean;
}
