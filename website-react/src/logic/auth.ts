'use client';

import { useEffect, useState } from "react";
import { ApiUserGetUserResponse } from "$/userApi";
import { validDepartments } from "$/userConstants";

export function useUser() {
  const [user, setUser] = useState<ApiUserGetUserResponse>();

  useEffect(() => {
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

      cookies[cookie.slice(0, eqSign)] = cookie.slice(eqSign + 1);
    });

    const initUser: ApiUserGetUserResponse = {
      ...(user || {}),
      success: false,
      isActive: document.cookie.includes('cvfd-token'),
      isUser: document.cookie.includes('cvfd-token'),
      isAdmin: document.cookie.includes('cvfd-user-admin=1'),
      isDistrictAdmin: document.cookie.includes('cvfd-user-super=1'),
      fName: cookies['cvfd-user-name'] || undefined,
    };
    validDepartments.forEach(dep => {
      const cookieName = `cvfd-user-${dep}`;
      if (typeof cookies[cookieName] === 'string') {
        try {
          initUser[dep] = JSON.parse(cookies[cookieName] as string);
        } catch (e) {
          console.error(`Error parsing cookie ${cookieName}`, e);
        }
      } else {
        initUser[dep] = {
          active: false,
          callSign: '',
          admin: false,
        };
      }
    });

    console.log('Initial User:', initUser);
    setUser(initUser);

    // Make the API call to get the most updated user
    if (initUser.isActive) {
      fetch(`/api/user?action=getUser`)
        .then(r => r.json())
        .then(data => {
          setUser(data);
        })
        .catch(e => console.error('getUser API', e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return user;
}
