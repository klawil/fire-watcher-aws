'use client';

import {
  useCallback, useContext, useEffect, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import {
  BsCheckCircleFill, BsXCircleFill
} from 'react-icons/bs';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  PagingTalkgroup, UpdateUserApi, pagingTalkgroups, validDepartments
} from '@/types/api/users';
import { pagingTalkgroupConfig } from '@/types/backend/department';
import { getLogger } from '@/utils/common/logger';
import { formatPhone } from '@/utils/common/strings';
import {
  AddAlertContext, LoggedInUserContext, RefreshLoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('profilePage');

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

  const [
    apiErrors,
    setApiErrors,
  ] = useState<string[]>([]);

  useEffect(() => {
    logger.warn('User', userEditInfo);
  }, [ userEditInfo, ]);

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
    ) {
      return;
    }
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
      ) {
        if (apiResponse !== null && 'errors' in apiResponse) {
          setApiErrors(apiResponse.errors);
        }
        throw {
          code,
          apiResponse,
        };
      }

      await reCheckUser();
      setUserEditInfo({});
    } catch (e) {
      addAlert('danger', 'Failed to update user information');
      logger.error(`Error updating user ${user} with ${userEditInfo}`, e);
    }
    setIsSaving(false);
  }

  return <>
    {(user === null || !user.isFinal) && <LoadingSpinner />}
    {user !== null && user.isFinal && <>
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
              isInvalid={apiErrors.includes(field.key)}
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
      <Row className='justify-content-center my-3'>
        <Col xl={3} lg={4} xs={6}>
          <h5 className='text-center'>Pages You Will Receive</h5>
          {pagingTalkgroups.map(tg => <Form.Check
            key={tg}
            isInvalid={apiErrors.includes('talkgroups')}
            type='switch'
            checked={typeof userEditInfo.talkgroups !== 'undefined'
              ? userEditInfo.talkgroups?.includes(tg)
              : (user.talkgroups || []).includes(tg)
            }
            label={pagingTalkgroupConfig[tg].partyBeingPaged}
            onChange={e => setUserTg(tg, e.target.checked)}
          />)}
        </Col>
        <Col xl={3} lg={4} xs={6}>
          <h5 className='text-center'>How You Receive Pages</h5>
          <Form.Check
            type='switch'
            isInvalid={apiErrors.includes('getTranscriptOnly')}
            name='page-method'
            checked={typeof userEditInfo.getTranscriptOnly !== 'undefined'
              ? !userEditInfo.getTranscriptOnly
              : !user.getTranscriptOnly
            }
            label={'Without Transcripts (Faster)'}
            onChange={e => setUserEditInfo(current => ({
              ...current,
              getTranscriptOnly: e.target.checked === !user.getTranscriptOnly
                ? undefined
                : !e.target.checked,
              ...e.target.checked
                ? {
                  getTranscript: false,
                }
                : {},
            }))}
          />
          <Form.Check
            type='switch'
            name='page-method'
            isInvalid={apiErrors.includes('getTranscript')}
            checked={typeof userEditInfo.getTranscript !== 'undefined'
              ? !!userEditInfo.getTranscript
              : !!user.getTranscript
            }
            label={'With Transcripts (Slower)'}
            onChange={e => setUserEditInfo(current => ({
              ...current,
              getTranscript: e.target.checked === user.getTranscript
                ? undefined
                : e.target.checked,
              ...e.target.checked
                ? {
                  getTranscriptOnly: true,
                }
                : {},
            }))}
          />
        </Col>
      </Row>

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
