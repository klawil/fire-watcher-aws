'use client';

import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { PageConfig } from '@/types/frontend/page';
import { useContext } from 'react';
import { LoggedInUserContext } from '@/utils/frontend/clientContexts';
import {
  DarkModeContext, LocationContext
} from '@/utils/frontend/clientContexts';

export default function CofrnNavbar({
  pageConfig,
}: Readonly<{
  pageConfig: PageConfig;
}>) {
  const colorModeName = useContext(DarkModeContext);

  const loc = useContext(LocationContext);
  const redirectTo = encodeURIComponent(loc ? `${loc?.pathname}${loc?.search}` : '');
  const loginLink = `/login?redirectTo=${redirectTo}`;
  const logoutLink = `/api/v2/logout/?redirectTo=${redirectTo}`;

  const user = useContext(LoggedInUserContext);
  if (user === null || colorModeName === null) return null;

  return (
    <Navbar
      fixed='top'
      expand='lg'
      bg={colorModeName}
    >
      <Container
        fluid={true}
      >
        <Navbar.Brand className='flex-grow-1'>COFRN {pageConfig?.navTitle || pageConfig?.title || ''}</Navbar.Brand>
        <Navbar.Toggle aria-controls='basic-navbar-nav' />

        <Navbar.Collapse id='basic-navbar-nav'>
          <Nav className='me-auto mb-2 mb-lg-0' activeKey={loc?.pathname || '/'}>
            <Nav.Link href='/'>Radio Traffic</Nav.Link>
            <Nav.Link href='/weather'>Weather</Nav.Link>
          </Nav>

          <Nav className='ms-auto mb-2 mb-lg-0' activeKey={loc?.pathname || '/'}>
            {!user.isUser && <Nav.Link href={loginLink}>Login</Nav.Link>}
            {user.isUser && <NavDropdown align='end' title={user.fName} id='nav-dropdown'>
              <NavDropdown.Item as={Nav.Link} href={logoutLink}>Logout</NavDropdown.Item>
              <NavDropdown.Item as={Nav.Link} href='/profile'>Edit Profile</NavDropdown.Item>
              {user.isAdmin && <NavDropdown.Item as={Nav.Link} href='/users'>Manage Users</NavDropdown.Item>}
              {user.isAdmin && <NavDropdown.Item as={Nav.Link} href='/texts'>View Texts</NavDropdown.Item>}
              {user.isAdmin && <NavDropdown.Item as={Nav.Link} href='/status'>System Status</NavDropdown.Item>}
            </NavDropdown>}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
