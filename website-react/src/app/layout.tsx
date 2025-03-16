'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import { useEffect, useState } from 'react';
import { DarkModeContext, LocationContext } from '@/logic/clientContexts';

function useDarkMode() {
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

function useLocation() {
  const [loc, setLoc] = useState<Location | null>(null);

  useEffect(() => {
    setLoc(window.location);

    window.addEventListener('popstate', () => {
      setLoc(window.location);
    });
  }, []);

  return loc;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isDarkMode = useDarkMode();
  const loc = useLocation();

  if (
    typeof isDarkMode === 'undefined' ||
    typeof location === 'undefined'
  ) return (<html><body></body></html>);

  const modeName = isDarkMode ? 'dark' : 'light';
  return (
    <html lang="en">
      <body data-bs-theme={modeName}>
        <DarkModeContext.Provider value={modeName}>
          <LocationContext.Provider value={loc}>
            {children}
          </LocationContext.Provider>
        </DarkModeContext.Provider>
      </body>
    </html>
  )
}
