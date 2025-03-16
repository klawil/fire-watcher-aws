import { UsersState } from "@/types/users";
import styles from './userRow.module.css';
import { validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { LoggedInUserContext } from "@/logic/authContext";
import UserEdit from "../userEdit/userEdit";
import { useContext, useState } from "react";

function formatPhone(phone: number | string): string {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}

export default function UserRow({
  user,
  idx,
}: Readonly<{
  user: UsersState['users'][number] | null;
  idx: number;
}>) {
  const loggedInUser = useContext(LoggedInUserContext);

  const rowClasses = [ 'text-center', 'align-middle' ];
  if (idx % 2 === 0)
    rowClasses.push(styles.highlightRow);

  const [editOpen, setEditOpen] = useState(false);

  return (<>
    {user !== null && <tr className={rowClasses.join(' ')}>
      <td>{formatPhone(user.phone)}</td>
      <td className="text-start">{user.lName}, {user.fName}</td>
      <td>{validDepartments
        .filter(dep => user[dep]?.active)
        .map(dep => `${dep} (${user[dep]?.callSign || '??'})`)
        .join(', ')
      }</td>
      <td>
        <Button
          onClick={() => setEditOpen(!editOpen)}
          variant={editOpen ? 'secondary' : 'primary'}
        >{editOpen ? 'Close' : 'Edit'}</Button>
      </td>
    </tr>}
    {user === null && <tr className={idx % 2 === 0 ? styles.highlightRow : ''}>
      <td className="align-middle text-center" colSpan={3}>Create a New User</td>
      <td className="align-middle text-center">
        <Button
          variant={editOpen ? 'secondary' : 'primary'}
          onClick={() => setEditOpen(!editOpen)}
        >{editOpen ? 'Close' : 'Open'}</Button>
        {/* @TODO - Implement delete button */}
      </td>
    </tr>}
    {editOpen && <tr className={idx % 2 === 0 ? styles.highlightRow : ''}><td colSpan={4}>
      <Container>
        {(user !== null && loggedInUser?.isDistrictAdmin) && <Row className="text-center">
          <Col md={6}><b>Last Login:</b> {
            typeof user.lastLogin === 'undefined'
              ? 'Never'
              : new Date(user.lastLogin).toLocaleString()
          }</Col>
          <Col md={6}><b>Logged In Devices:</b> {user.loginTokens?.length || 0}</Col>
        </Row>}
        <UserEdit user={user} />
      </Container>
    </td></tr>}
  </>)
}