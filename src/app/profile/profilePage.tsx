'use client';

import { formatPhone } from '@/utils/common/strings';
import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  AddAlertContext, LoggedInUserContext, RefreshLoggedInUserContext
} from '@/utils/frontend/clientContexts';
import {
  useCallback, useContext, useState
} from 'react';
import Table from 'react-bootstrap/Table';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import {
  BsCheckCircleFill, BsXCircleFill
} from 'react-icons/bs';
import InputGroup from 'react-bootstrap/InputGroup';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import {
  PagingTalkgroup, pagingTalkgroups, UpdateUserApi, validDepartments
} from '@/types/api/users';
import { typeFetch } from '@/utils/frontend/typeFetch';
import { pagingTalkgroupConfig } from '@/types/backend/department';

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

export default function ProfilePage() {
  const user = useContext(LoggedInUserContext);
  const reCheckUser = useContext(RefreshLoggedInUserContext);
  const addAlert = useContext(AddAlertContext);

  const [
    userEditInfo,
    setUserEditInfo,
  ] = useState<UpdateUserApi['body']>({});
  const setUserTg = useCallback((tg: PagingTalkgroup, add: boolean) => setUserEditInfo(state => {
    const newTalkgroups = [
      ...(
        typeof state !== 'undefined' && typeof state.talkgroups !== 'undefined'
          ? state.talkgroups || []
          : user?.talkgroups || []
      ).filter(tgCheck => tgCheck !== tg),
      ...add ? [ tg, ] : [],
    ];

    // Figure out if we have any changes
    let hasChanges = true;
    if (user !== null) {
      const newTgs = newTalkgroups.filter(tg => !(user.talkgroups || [])
        .includes(tg));
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
      talkgroups: newTalkgroups.length === 0 ? null : newTalkgroups,
    };
  }), [
    setUserEditInfo,
    user,
  ]);

  const hasChanges = (Object.keys(userEditInfo) as (keyof typeof userEditInfo)[])
    .filter(key => typeof userEditInfo[key] !== 'undefined')
    .length > 0;

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);
  async function saveUser() {
    if (
      !hasChanges ||
      user === null ||
      !user.isUser
    ) return;
    setIsSaving(true);

    const apiParams: UpdateUserApi['params'] = {
      id: 'current',
    };
    const apiBody: UpdateUserApi['body'] = {
      ...userEditInfo,
    };
    try {
      const [
        code,
        apiResponse,
      ] = await typeFetch<UpdateUserApi>({
        path: '/api/v2/users/{id}/',
        method: 'PATCH',
        params: apiParams,
        body: apiBody,
      });

      if (
        code !== 200 ||
        apiResponse === null ||
        'message' in apiResponse
      ) throw {
        code, apiResponse,
      };

      await reCheckUser();
      setUserEditInfo({});
    } catch (e) {
      addAlert('danger', 'Failed to update user information');
      console.error(`Error updating user ${user} with ${userEditInfo}`, e);
    }
    setIsSaving(false);
  }

  return <>
    {(user === null || !user.fromApi) && <LoadingSpinner />}
    {user !== null && user.fromApi && <>
      <h2 className='text-center'>Information Only an Admin Can Edit:</h2>
      <Row className='justify-content-center my-3'>
        <Col md={6}><InputGroup>
          <InputGroup.Text>Phone Number</InputGroup.Text>
          <Form.Control
            type='text'
            value={formatPhone(user.phone || '')}
            disabled={true}
          />
        </InputGroup></Col>
      </Row>

      <Row className='justify-content-center my-3'>
        <Col xl={6} lg={8} md={10}><Table striped>
          <thead><tr className='text-center'>
            <th>Department</th>
            <th>Active</th>
            <th>Call Sign</th>
            <th>Admin</th>
          </tr></thead>
          <tbody className='align-middle text-center'>
            {validDepartments
              .filter(dep => typeof user[dep] !== 'undefined')
              .map(dep => <tr key={dep}>
                <td>{dep}</td>
                <td>{user[dep]?.active ? <BsCheckCircleFill className='text-success' /> : <BsXCircleFill className='text-danger' />}</td>
                <td>{user[dep]?.callSign || 'N/A'}</td>
                <td>{user[dep]?.admin ? <BsCheckCircleFill className='text-success' /> : <BsXCircleFill className='text-danger' />}</td>
              </tr>)}
          </tbody>
        </Table></Col>
      </Row>

      <h2 className='text-center my-3'>Information You Can Edit:</h2>
      {userEditableFields.map(field =>
        <Row className='justify-content-center my-3' key={field.key}><Col md={6}>
          <InputGroup>
            <InputGroup.Text>{field.label}</InputGroup.Text>
            <Form.Control
              type='text'
              value={typeof userEditInfo[field.key] !== 'undefined'
                ? userEditInfo[field.key] || ''
                : user[field.key] || ''
              }
              onChange={e => setUserEditInfo(current => ({
                ...current,
                [field.key]: e.target.value === user[field.key]
                  ? undefined
                  : e.target.value,
              }))}
            />
          </InputGroup>
        </Col></Row>)}
      <Row className='justify-content-center my-3'><Col xl={3} lg={4} xs={6}>
        <h5 className='text-center'>Pages You Will Receive</h5>
        {pagingTalkgroups.map(tg => <Form.Check
          key={tg}
          type='switch'
          checked={typeof userEditInfo.talkgroups !== 'undefined'
            ? userEditInfo.talkgroups?.includes(tg)
            : (user.talkgroups || []).includes(tg)
          }
          label={pagingTalkgroupConfig[tg].partyBeingPaged}
          onChange={e => setUserTg(tg, e.target.checked)}
        />)}
      </Col></Row>

      <Row className='justify-content-center text-center'><Col xs={2}>
        <Button
          variant='success'
          disabled={!hasChanges || isSaving}
          onClick={saveUser}
        >{isSaving ? <><Spinner size='sm' /> Saving</> : 'Save Changes'}</Button>
      </Col></Row>
    </>}
    {user !== null && !user.isUser && <h1 className='text-center'>
      You must be logged in to access this page
    </h1>}
  </>;
}
