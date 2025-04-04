'use client';

import { createContext } from "react";
import { Variant } from 'react-bootstrap/esm/types';
import { FrontendUserState } from "$/apiv2/users";

export const LoggedInUserContext = createContext<null | FrontendUserState>(null);
export const RefreshLoggedInUserContext = createContext<() => Promise<void>>(async () => {});
export const DarkModeContext = createContext<null | 'dark' | 'light'>(null);
export const LocationContext = createContext<null | Location>(null);
export const AddAlertContext = createContext<(type: Variant, message: string) => void>(() => {});
