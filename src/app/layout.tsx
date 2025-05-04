'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import {
  useCallback, useEffect, useState
} from 'react';
import Alert from 'react-bootstrap/Alert';
import Container from 'react-bootstrap/Container';
import { Variant } from 'react-bootstrap/esm/types';

import {
  FrontendUserObject, FrontendUserState, GetUserApi, validDepartments
} from '@/types/api/users';
import {
  AddAlertContext, DarkModeContext, LocationContext, LoggedInUserContext, RefreshLoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

function useDarkMode() {
  const [
    isDarkMode,
    setIsDarkMode,
  ] = useState<boolean>();

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
  const [
    loc,
    setLoc,
  ] = useState<Location | null>(null);

  useEffect(() => {
    setLoc(window.location);

    window.addEventListener('popstate', () => {
      setLoc(window.location);
    });
  }, []);

  return loc;
}

const localStorageUserKey = 'cofrn-user';

function useUser(addAlert: (type: Variant, message: string) => void): [
  FrontendUserState | null,
  () => Promise<void>
] {
  const [
    user,
    setUser,
  ] = useState<FrontendUserState | null>(null);

  async function getUserFromApi() {
    try {
      const [
        code,
        apiResult,
      ] = await typeFetch<GetUserApi>({
        path: '/api/v2/users/{id}/',
        method: 'GET',
        params: {
          id: 'current',
        },
      });

      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        throw {
          code,
          apiResult,
        };
      }

      localStorage.setItem(localStorageUserKey, JSON.stringify(apiResult));
      setUser({
        fromApi: true,
        isFinal: true,
        isUser: true,
        isDistrictAdmin: false,
        isAdmin: validDepartments.some(dep => apiResult[dep]?.active && apiResult[dep].admin),
        ...apiResult,
      });
    } catch (e) {
      addAlert('danger', 'Failed to update the current user\'s information');
      console.error('Failed to fetch current user', e);
    }
  }

  useEffect(() => {
    if (user?.fromApi) {
      return;
    }

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
        fromApi: false,
        isFinal: true,
        isUser: false,
        isAdmin: false,
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
        fromApi: false,
        isFinal: false,
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
      });
      return;
    }

    try {
      const initUser: FrontendUserObject = JSON.parse(lsUserStr);
      console.log('Initial User:', initUser);
      setUser({
        fromApi: false,
        isFinal: false,
        isUser: true,
        isDistrictAdmin: true,
        isAdmin: validDepartments.some(dep => initUser[dep]?.active && initUser[dep].admin),
        ...initUser,
      });
    } catch (e) {
      addAlert('danger', 'Invalid user information was found, attempting to refresh the user');
      console.error('Failed to parse localStorage user', e);
      localStorage.removeItem(localStorageUserKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [
    user,
    getUserFromApi,
  ];
}

function randomKey() {
  const vals = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const key = Array.from(Array(10), () => vals[Math.floor(Math.random() * vals.length)])
    .join('');

  return key;
}

interface AlertConfig {
  type: Variant;
  message: string;
  id: string;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [
    alerts,
    setAlerts,
  ] = useState<AlertConfig[]>([]);
  const addAlert = useCallback((type: Variant, message: string) => {
    const id = randomKey();
    setAlerts(cur => [
      ...cur,
      {
        type,
        message,
        id,
      },
    ]);

    setTimeout(() => setAlerts(cur => cur.filter(a => a.id !== id)), 5000);
  }, []);

  const isDarkMode = useDarkMode();
  const loc = useLocation();
  const [
    user,
    refreshUser,
  ] = useUser(addAlert);

  if (
    typeof isDarkMode === 'undefined' ||
    typeof location === 'undefined' ||
    user === null
  ) {
    return <html>
      <head><link rel='icon' type='image/png' href='/favicon.png' /></head>
      <body data-bs-theme={'dark'}></body>
    </html>;
  }

  const modeName = isDarkMode ? 'dark' : 'light';
  return (
    <html lang='en'>
      <head><link rel='icon' type='image/png' href='/favicon.png' /></head>
      <body data-bs-theme={modeName}>
        {alerts.length > 0 && <Container
          style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translate(-50%, 0%)',
            zIndex: 1000,
          }}
        >
          {alerts.map(alertConf => <Alert
            dismissible
            key={alertConf.id}
            className='alert-fixed'
            variant={alertConf.type}
            onClose={() => setAlerts(cur => cur.filter(a => a.id !== alertConf.id))}
          >{alertConf.message}</Alert>)}
        </Container>}

        <DarkModeContext.Provider value={modeName}>
          <LocationContext.Provider value={loc}>
            <LoggedInUserContext.Provider value={user}>
              <RefreshLoggedInUserContext.Provider value={refreshUser}>
                <AddAlertContext.Provider value={addAlert}>
                  {children}
                </AddAlertContext.Provider>
              </RefreshLoggedInUserContext.Provider>
            </LoggedInUserContext.Provider>
          </LocationContext.Provider>
        </DarkModeContext.Provider>
      </body>
    </html>
  );
}
