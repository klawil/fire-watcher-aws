'use client';

import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useLocation } from "@/logic/clientHooks";
import { PageConfig } from '@/types/page';
import { useContext } from 'react';
import { LoggedInUserContext } from '@/logic/authContext';

export default function CofrnNavbar({
  pageConfig,
  modeName,
}: Readonly<{
  pageConfig: PageConfig;
  modeName: 'dark' | 'light';
}>) {
  const loc = useLocation();
  const redirectTo = encodeURIComponent(loc ? `${loc?.pathname}${loc?.search}` : '')
  const loginLink = `/login?redirectTo=${redirectTo}`;
  const logoutLink = `/api/user?action=logout&redirectTo=${redirectTo}`;

  const user = useContext(LoggedInUserContext);
  if (user === null) return null;

  return (
    <Navbar
      fixed="top"
      expand="lg"
      bg={modeName}
    >
      <Container
        fluid={true}
      >
        <Navbar.Brand>COFRN {pageConfig?.navTitle || pageConfig?.title || ''}</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />

        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto mb-2 mb-lg-0" activeKey={loc?.pathname || '/'}>
            <Nav.Link href="/">Radio Traffic</Nav.Link>
            <Nav.Link href="/weather">Weather</Nav.Link>
          </Nav>

          <Nav className="ms-auto mb-2 mb-lg-0" activeKey={loc?.pathname || '/'}>
            {!user.isUser && <Nav.Link href={loginLink}>Login</Nav.Link>}
            {user.isUser && <NavDropdown align="end" title={user.fName} id="nav-dropdown">
              <NavDropdown.Item href={logoutLink}>Logout</NavDropdown.Item>
              <NavDropdown.Item href="/profile">Edit Profile</NavDropdown.Item>
              {user.isAdmin && <NavDropdown.Item href="/users">Manage Users</NavDropdown.Item>}
              {user.isAdmin && <NavDropdown.Item href="/texts">View Texts</NavDropdown.Item>}
              {user.isAdmin && <NavDropdown.Item href="/status">System Status</NavDropdown.Item>}
            </NavDropdown>}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}
