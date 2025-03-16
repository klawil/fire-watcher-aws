'use client';

import { formatPhone } from "$/stringManipulation";
import CofrnLayout from "@/components/layout";
import LoadingSpinner from "@/components/loadingSpinner/loadingSpinner";
import { LoggedInUserContext, RefreshLoggedInUserContext } from "@/logic/clientContexts";
import { useCallback, useContext, useState } from "react";
import Table from "react-bootstrap/Table";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import { pagingConfig, PagingTalkgroup, pagingTalkgroupOrder, validDepartments } from "$/userConstants";
import { BsCheckCircleFill, BsXCircleFill } from "react-icons/bs";
import InputGroup from "react-bootstrap/InputGroup";
import Form from "react-bootstrap/Form";
import { ApiUserUpdateBody, ApiUserUpdateResponse, UserObject } from "$/userApi";
import { Button, Spinner } from "react-bootstrap";

const userEditableFields: {
  key: 'fName' | 'lName';
  label: string;
}[] = [
  {
    key: 'fName',
    label: 'First Name',
  },
  {
    key: 'lName',
    label: 'Last Name',
  },
];

export default function Page() {
  const user = useContext(LoggedInUserContext);
  const reCheckUser = useContext(RefreshLoggedInUserContext);

  const [userEditInfo, setUserEditInfo] = useState<Partial<
    Pick<UserObject, 'fName'> & Pick<UserObject, 'lName'> & Pick<UserObject, 'talkgroups'>
  >>({});
  const setUserTg = useCallback((tg: PagingTalkgroup, add: boolean) => setUserEditInfo(state => {
    const newTalkgroups = [
      ...(
        typeof state !== 'undefined' && typeof state.talkgroups !== 'undefined'
          ? state.talkgroups
          : (user?.talkgroups || [])
      ).filter(tgCheck => tgCheck !== tg),
      ...(add ? [ tg ] : []),
    ];

    // Figure out if we have any changes
    let hasChanges = true;
    if (user !== null) {
      const newTgs = newTalkgroups.filter(tg => !(user.talkgroups || [])
        .includes(tg as PagingTalkgroup));
      const removedTgs = (user.talkgroups || []).filter(tg => !newTalkgroups.includes(tg));
      hasChanges = newTgs.length > 0 || removedTgs.length > 0;
    }

    if (!hasChanges) {
      return {
        ...state,
        talkgroups: undefined,
      };
    }

    return {
      ...state,
      talkgroups: newTalkgroups,
    };
  }), [setUserEditInfo, user]);

  const hasChanges = (Object.keys(userEditInfo) as (keyof typeof userEditInfo)[])
    .filter(key => typeof userEditInfo[key] !== 'undefined')
    .length > 0;

  const [isSaving, setIsSaving] = useState(false);
  async function saveUser() {
    if (
      !hasChanges ||
      user === null ||
      !user.isActive
    ) return;
    setIsSaving(true);

    const apiBody: ApiUserUpdateBody = {
      isMe: true,
      phone: (user.phone as string).toString(),
      ...userEditInfo,
    };
    try {
      const apiResponse: ApiUserUpdateResponse = await fetch(`/api/user?action=update`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());

      if (apiResponse.success) {
        setUserEditInfo({});
        reCheckUser();
      }
    } catch (e) {
      console.error(`Error updating user ${user} with ${userEditInfo}`, e);
    }
    setIsSaving(false);
  }

  return (<CofrnLayout
    pageConfig={{
      title: 'Profile',
    }}
  >
    {user === null && <LoadingSpinner />}
    {user !== null && user.isActive && <>
      <h2 className="text-center">Information Only an Admin Can Edit:</h2>
      <Row className="justify-content-center my-3">
        <Col md={6}><InputGroup>
          <InputGroup.Text>Phone Number</InputGroup.Text>
          <Form.Control
            type="text"
            value={formatPhone(user.phone || '')}
            disabled={true}
          />
        </InputGroup></Col>
      </Row>

      <Row className="justify-content-center my-3">
        <Col xl={6} lg={8} md={10}><Table striped>
          <thead><tr className="text-center">
            <th>Department</th>
            <th>Active</th>
            <th>Call Sign</th>
            <th>Admin</th>
          </tr></thead>
          <tbody className="align-middle text-center">
            {validDepartments
              .filter(dep => typeof user[dep] !== 'undefined')
              .map(dep => (<tr key={dep}>
                <td>{dep}</td>
                <td>{user[dep]?.active ? (<BsCheckCircleFill className="text-success" />) : (<BsXCircleFill className="text-danger" />)}</td>
                <td>{user[dep]?.callSign || 'N/A'}</td>
                <td>{user[dep]?.admin ? (<BsCheckCircleFill className="text-success" />) : (<BsXCircleFill className="text-danger" />)}</td>
              </tr>))}
          </tbody>
        </Table></Col>
      </Row>

      <h2 className="text-center my-3">Information You Can Edit:</h2>
      {userEditableFields.map(field => (
        <Row className="justify-content-center my-3" key={field.key}><Col md={6}>
          <InputGroup>
            <InputGroup.Text>{field.label}</InputGroup.Text>
            <Form.Control
              type="text"
              value={typeof userEditInfo[field.key] !== 'undefined'
                ? userEditInfo[field.key]
                : user[field.key]
              }
              onChange={e => setUserEditInfo(current => ({
                ...current,
                [field.key]: e.target.value === user[field.key]
                  ? undefined
                  : e.target.value,
              }))}
            />
          </InputGroup>
        </Col></Row>
      ))}
      <Row className="justify-content-center my-3"><Col xl={3} lg={4} xs={6}>
        <h5 className="text-center">Pages You Will Receive</h5>
        {pagingTalkgroupOrder.map(tg => (<Form.Check
          key={tg}
          type="switch"
          checked={typeof userEditInfo.talkgroups !== 'undefined'
            ? userEditInfo.talkgroups.includes(tg)
            : (user.talkgroups || []).includes(tg)
          }
          label={pagingConfig[tg].partyBeingPaged}
          onChange={e => setUserTg(tg, e.target.checked)}
        />
        ))}
      </Col></Row>

      <Row className="justify-content-center text-center"><Col xs={2}>
        <Button
          variant="success"
          disabled={!hasChanges || isSaving}
          onClick={saveUser}
        >{isSaving ? (<><Spinner size="sm" /> Saving</>) : 'Save Changes'}</Button>
      </Col></Row>
    </>}
    {user !== null && !user.isActive && <h1 className="text-center">
      You must be logged in to access this page
    </h1>}
  </CofrnLayout>);
}
