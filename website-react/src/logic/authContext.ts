'use client';

import { createContext } from "react";
import { ApiUserGetUserResponse } from "$/userApi";

export const LoggedInUserContext = createContext<null | ApiUserGetUserResponse>(null);
