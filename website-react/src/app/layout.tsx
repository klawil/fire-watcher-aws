'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import { useEffect, useState } from 'react';
import { DarkModeContext, LocationContext, LoggedInUserContext, RefreshLoggedInUserContext } from '@/logic/clientContexts';
import { ApiUserGetUserResponse } from "$/userApi";

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

const localStorageUserKey = 'cofrn-user';

function useUser(): [
  ApiUserGetUserResponse | null,
  () => Promise<void>,
] {
  const [user, setUser] = useState<ApiUserGetUserResponse | null>(null);

  async function getUserFromApi() {
    try {
      const apiResult: ApiUserGetUserResponse = await fetch('/api/user?action=getUser')
        .then(r => r.json());

      localStorage.setItem(localStorageUserKey, JSON.stringify(apiResult));
      setUser(apiResult);
    } catch (e) {
      console.error(`Failed to fetch current user`, e);
    }
  }

  useEffect(() => {
    if (user?.success) return;

    // Parse information out of the cookies
    const cookies: {
      [key: string]: string | null;
    } = {};
    document.cookie.split('; ').forEach(cookie => {
      const eqSign = cookie.indexOf('=');
      if (eqSign === -1) {
        cookies[cookie] = null;
        return;
      }

      cookies[cookie.slice(0, eqSign)] = decodeURIComponent(cookie.slice(eqSign + 1));
    });

    // Check the cookies for an active user
    if (
      !cookies['cofrn-token'] ||
      !cookies['cofrn-user']
    ) {
      localStorage.removeItem(localStorageUserKey);
      setUser({
        success: true,
        isUser: false,
        isDistrictAdmin: false,
      });
      return;
    }

    // Start the process of fetching the user info from the API
    getUserFromApi();

    // Check localStorage for a user
    const lsUserStr = localStorage.getItem(localStorageUserKey);
    if (lsUserStr === null) {
      setUser({
        success: false,
        isUser: false,
        isDistrictAdmin: false,
      });
      return;
    }

    try {
      const initUser: ApiUserGetUserResponse = JSON.parse(lsUserStr);
      console.log('Initial User:', initUser);
      setUser(initUser);
    } catch (e) {
      console.error(`Failed to parse localStorage user`, e);
      localStorage.removeItem(localStorageUserKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [user, getUserFromApi];
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isDarkMode = useDarkMode();
  const loc = useLocation();
  const [user, refreshUser] = useUser();

  if (
    typeof isDarkMode === 'undefined' ||
    typeof location === 'undefined' ||
    user === null
  ) return (<html><body></body></html>);

  const modeName = isDarkMode ? 'dark' : 'light';
  return (
    <html lang="en">
      <body data-bs-theme={modeName}>
        <DarkModeContext.Provider value={modeName}>
          <LocationContext.Provider value={loc}>
            <LoggedInUserContext.Provider value={user}>
              <RefreshLoggedInUserContext.Provider value={refreshUser}>
                {children}
              </RefreshLoggedInUserContext.Provider>
            </LoggedInUserContext.Provider>
          </LocationContext.Provider>
        </DarkModeContext.Provider>
      </body>
    </html>
  )
}
