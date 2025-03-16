'use client';

import { PageConfig } from "@/types/page";
import CofrnNavbar from "./navbar";
import { Container, Nav, Navbar } from "react-bootstrap";
import { LoggedInUserContext, DarkModeContext } from "@/logic/clientContexts";
import { useContext } from "react";

export default function CofrnLayout({
  children,
  pageConfig,
}: Readonly<{
  children: React.ReactNode;
  pageConfig: PageConfig;
}>) {
  const colorModeName = useContext(DarkModeContext);
  const user = useContext(LoggedInUserContext);

  if (colorModeName === null) return (<>
    <title>{pageConfig.title}</title>
  </>);

  return (
    <LoggedInUserContext.Provider value={user}>
      <title>{pageConfig.title}</title>
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
