'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import { useEffect, useState } from 'react';
import { DarkModeContext, LocationContext, LoggedInUserContext, RefreshLoggedInUserContext } from '@/logic/clientContexts';
import { ApiUserGetUserResponse } from "$/userApi";
import { UserDepartment } from "$/userConstants";

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

function useUser(): [
  ApiUserGetUserResponse | null,
  () => Promise<void>,
] {
  const [user, setUser] = useState<ApiUserGetUserResponse | null>(null);

  async function getUserFromApi() {
    try {
      const apiResult: ApiUserGetUserResponse = await fetch('/api/user?action=getUser')
        .then(r => r.json());

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
    let departments: {
      [key in UserDepartment]?: ApiUserGetUserResponse[UserDepartment];
    } = {};
    if (typeof cookies['cofrn-user-departments'] === 'string') {
      departments = JSON.parse(cookies['cofrn-user-departments']);
    }

    const initUser: ApiUserGetUserResponse = {
      ...(user || {}),
      success: false,
      isActive: document.cookie.includes('cofrn-token'),
      isUser: document.cookie.includes('cofrn-token'),
      isAdmin: document.cookie.includes('cofrn-user-admin=1'),
      isDistrictAdmin: document.cookie.includes('cofrn-user-super=1'),
      fName: cookies['cofrn-user-name'] || undefined,
      ...departments,
    };

    console.log('Initial User:', initUser);
    setUser(initUser);

    // Make the API call to get the most updated user
    if (initUser.isActive && !initUser.success) {
      getUserFromApi();
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
