'use client';

import { useDarkMode } from "@/logic/clientHooks";
import { PageConfig } from "@/types/page";
import CofrnNavbar from "./navbar";
import { Container, Nav, Navbar } from "react-bootstrap";

export default function CofrnLayout({
  children,
  pageConfig,
}: Readonly<{
  children: React.ReactNode;
  pageConfig: PageConfig;
}>) {
  const isDarkMode = useDarkMode();
  if (typeof isDarkMode === 'undefined') return (<></>);

  const modeName = isDarkMode ? 'dark' : 'light';

  return (
    <>
      <CofrnNavbar
        pageConfig={pageConfig}
        modeName={modeName}
      />

      {pageConfig.title && <h1 className="text-center">{pageConfig.title}</h1>}
      {children}

      <Navbar
        bg={modeName}
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
                filter: `invert(${modeName === 'dark' ? 1 : 0})`,
              }}
            />
          </Navbar.Brand>
          <Nav.Link className="mx-4" href="/about">About Us</Nav.Link>
          <Navbar.Text className="mx-4">© 2025 First Responder Notifications, LLC</Navbar.Text>
        </Container>
      </Navbar>
    </>
  );
}
