import { UserActions, UsersState } from "@/types/users";
import styles from './userRow.module.css';
import { validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useCallback, useState } from "react";
import { UserObject } from "$/userApi";
import { useUser } from "@/logic/auth";
import UserEdit from "../userEdit/userEdit";

function formatPhone(phone: number | string): string {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}

export default function UserRow({
  user,
  idx,
  dispatch,
}: Readonly<{
  user: UsersState['users'][number];
  idx: number;
  dispatch: React.ActionDispatch<[action: UserActions]>;
}>) {
  const rowClasses = [ 'text-center', 'align-middle' ];
  if (idx % 2 === 0)
    rowClasses.push(styles.highlightRow);

  const loggedInUser = useUser();

  return (<>
    <tr className={rowClasses.join(' ')}>
      <td>{formatPhone(user.phone)}</td>
      <td className="text-start">{user.lName}, {user.fName}</td>
      <td>{validDepartments
        .filter(dep => user[dep]?.active)
        .map(dep => `${dep} (${user[dep]?.callSign || '??'})`)
        .join(', ')
      }</td>
      <td>
        <Button
          onClick={() => dispatch({
            action: 'SetUserEditRow',
            phone: user.phone,
            editRowOpen: !user.editRowOpen,
          })}
          variant={user.editRowOpen ? 'secondary' : 'primary'}
        >{user.editRowOpen ? 'Close' : 'Edit'}</Button>
      </td>
    </tr>
    {user.editRowOpen && <tr className={idx % 2 === 0 ? styles.highlightRow : ''}><td colSpan={4}>
      <Container>
        {loggedInUser?.isDistrictAdmin && <Row className="text-center">
          <Col md={6}><b>Last Login:</b> {
            typeof user.lastLogin === 'undefined'
              ? 'Never'
              : new Date(user.lastLogin).toLocaleString()
          }</Col>
          <Col md={6}><b>Logged In Devices:</b> {user.loginTokens?.length || 0}</Col>
        </Row>}
        <UserEdit user={user} dispatch={dispatch} />
      </Container>
    </td></tr>}
  </>)
}