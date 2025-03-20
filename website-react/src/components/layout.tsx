'use client';

import { PageConfig } from "@/types/page";
import CofrnNavbar from "./navbar";
import { Container, Nav, Navbar } from "react-bootstrap";
import { LoggedInUserContext, DarkModeContext } from "@/logic/clientContexts";
import { useContext, useEffect } from "react";

export default function CofrnLayout({
  children,
  pageConfig,
}: Readonly<{
  children: React.ReactNode;
  pageConfig: PageConfig;
}>) {
  const colorModeName = useContext(DarkModeContext);
  const user = useContext(LoggedInUserContext);

  useEffect(() => {
    if (
      user === null ||
      !user.success ||
      (
        !pageConfig.requireAuth &&
        !pageConfig.requireAdmin
      )
    ) return;

    if (!user.isUser) {
      window.location.replace(`/login?redirectTo=${
        encodeURIComponent(`${window.location.pathname}${window.location.search}`)
      }`);
      return;
    }

    if (pageConfig.requireAdmin && !user.isAdmin) {
      window.location.replace('/');
    }
  }, [user, pageConfig.requireAdmin, pageConfig.requireAuth]);

  if (colorModeName === null) return (<></>);

  return (
    <LoggedInUserContext.Provider value={user}>
      <CofrnNavbar pageConfig={pageConfig} />

      {pageConfig.title && <h1 className="text-center">{pageConfig.title}</h1>}

      <Container
        className={pageConfig.centerAll ? 'text-center' : ''}
        fluid={!!pageConfig.fluid}
      >
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
