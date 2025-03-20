'use client';

import { createContext } from "react";
import { ApiUserGetUserResponse } from "$/userApi";
import { Variant } from 'react-bootstrap/esm/types';

export const LoggedInUserContext = createContext<null | ApiUserGetUserResponse>(null);
export const RefreshLoggedInUserContext = createContext<() => Promise<void>>(async () => {});
export const DarkModeContext = createContext<null | 'dark' | 'light'>(null);
export const LocationContext = createContext<null | Location>(null);
export const AddAlertContext = createContext<(type: Variant, message: string) => void>(() => {});
