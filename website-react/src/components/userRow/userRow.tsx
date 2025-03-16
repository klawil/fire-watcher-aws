import { UsersState } from "@/types/users";
import styles from './userRow.module.css';
import { validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { LoggedInUserContext } from "@/logic/clientContexts";
import UserEdit from "../userEdit/userEdit";
import { useContext, useState } from "react";
import { BsTrash } from "react-icons/bs";
import { UsersDispatchContext } from "@/logic/usersState";
import { formatPhone } from "$/stringManipulation";

export default function UserRow({
  user,
  idx,
}: Readonly<{
  user: UsersState['users'][number] | null;
  idx: number;
}>) {
  const dispatch = useContext(UsersDispatchContext);
  const loggedInUser = useContext(LoggedInUserContext);

  const rowClasses = [ 'text-center', 'align-middle' ];
  if (idx % 2 === 0)
    rowClasses.push(styles.highlightRow);

  const [editOpen, setEditOpen] = useState(false);

  async function deleteUser() {
    if (user === null) return;
    dispatch({
      action: 'SetDeleteModal',
      user,
    });
  }

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
          className="mx-1"
        >{editOpen ? 'Close' : 'Edit'}</Button>
        {loggedInUser?.isDistrictAdmin && <Button
          variant="danger"
          className="mx-1"
          onClick={() => deleteUser()}
        ><BsTrash /></Button>}
      </td>
    </tr>}
    {user === null && <tr className={idx % 2 === 0 ? styles.highlightRow : ''}>
      <td className="align-middle text-center" colSpan={3}>Create a New User</td>
      <td className="align-middle text-center">
        <Button
          variant={editOpen ? 'secondary' : 'primary'}
          onClick={() => setEditOpen(!editOpen)}
        >{editOpen ? 'Close' : 'Open'}</Button>
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
        <UserEdit setEditOpen={setEditOpen} user={user} />
      </Container>
    </td></tr>}
  </>)
}