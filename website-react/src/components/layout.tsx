'use client';

import { PageConfig } from "@/types/page";
import CofrnNavbar from "./navbar";
import { Container, Nav, Navbar } from "react-bootstrap";
import { LoggedInUserContext, DarkModeContext } from "@/logic/clientContexts";
import { ApiUserGetUserResponse } from "$/userApi";
import { useContext, useEffect, useState } from "react";
import { validDepartments } from "$/userConstants";

function useUser() {
  const [user, setUser] = useState<ApiUserGetUserResponse | null>(null);

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
    if (initUser.isActive && !initUser.success) {
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

export default function CofrnLayout({
  children,
  pageConfig,
}: Readonly<{
  children: React.ReactNode;
  pageConfig: PageConfig;
}>) {
  const colorModeName = useContext(DarkModeContext);

  const user = useUser();

  if (colorModeName === null) return (<></>);

  return (
    <LoggedInUserContext.Provider value={user}>
      <CofrnNavbar pageConfig={pageConfig} />

      {pageConfig.title && <h1 className="text-center">{pageConfig.title}</h1>}

      <Container className={pageConfig.centerAll ? 'text-center' : ''}>
        {children}
      </Container>

      <Navbar
        bg={colorModeName}
        className="mt-4"
      >
        <Container
          fluid={true}
          className="justify-content-center"
        >
          <Navbar.Brand href="#">
            <img
              src="/favicon.png"
              width="30"
              height="24"
              className="d-inline-block align-top"
              alt="COFRN"
              style={{
                filter: `invert(${colorModeName === 'dark' ? 1 : 0})`,
              }}
            />
          </Navbar.Brand>
          <Nav.Link className="mx-4" href="/about">About Us</Nav.Link>
          <Navbar.Text className="mx-4">© 2025 First Responder Notifications, LLC</Navbar.Text>
        </Container>
      </Navbar>
    </LoggedInUserContext.Provider>
  );
}
