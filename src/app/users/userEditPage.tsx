'use client';

import React, {
  useCallback, useContext, useEffect, useReducer, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import UserRow from '@/components/userRow/userRow';
import { GetAladtecUsersApi } from '@/types/api/aladtec';
import {
  DeleteUserApi,
  GetAllUsersApi,
  PagingTalkgroup,
  UserDepartment,
  pagingTalkgroups,
  validDepartments
} from '@/types/api/users';
import {
  departmentConfig,
  pagingTalkgroupConfig
} from '@/types/backend/department';
import { getLogger } from '@/utils/common/logger';
import {
  AddAlertContext,
  AladTecUsersContext,
  LoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';
import {
  UsersDispatchContext,
  defaultUsersState, usersStateReducer
} from '@/utils/frontend/usersState';

const logger = getLogger('userEditPage');

export default function UserEditPage() {
  const [
    state,
    dispatch,
  ] = useReducer(usersStateReducer, defaultUsersState);

  const addAlert = useContext(AddAlertContext);
  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [
        code,
        apiResult,
      ] = await typeFetch<GetAllUsersApi>({
        path: '/api/v2/users/',
        method: 'GET',
      });

      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        logger.error('Failed to get users', code, apiResult);
        return;
      }

      dispatch({
        action: 'SetUsers',
        users: apiResult,
      });
      setIsLoading(false);
    })();
  }, []);

  const loggedInUser = useContext(LoggedInUserContext);
  const [
    aladTecUsers,
    setAladTecUsers,
  ] = useState<null | { [key: string]: string; }>(null);
  useEffect(() => {
    if (loggedInUser?.isFinal && loggedInUser?.isDistrictAdmin) {
      (async () => {
        const [
          code,
          apiResult,
        ] = await typeFetch<GetAladtecUsersApi>({
          path: '/api/v2/aladtec/',
          method: 'GET',
        });

        if (
          code !== 200 ||
          apiResult === null ||
          'message' in apiResult
        ) {
          logger.error('Failed to get users', code, apiResult);
          return;
        }

        setAladTecUsers(apiResult);
      })();
    }
  }, [ loggedInUser, ]);

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  const [
    departmentFilter,
    setDepartmentFilter,
  ] = useState<UserDepartment | ''>('');

  const [
    roleFilter,
    setRoleFilter,
  ] = useState<'districtAdmin' | 'admin' | 'user' | ''>('');

  const [
    canEditNamesFilter,
    setCanEditNamesFilter,
  ] = useState<'all' | 'yes' | 'no'>('all');

  const [
    receivesAlertsFilter,
    setReceivesAlertsFilter,
  ] = useState<'all' | 'yes' | 'no'>('all');

  const [
    talkgroupTextsFilter,
    setTalkgroupTextsFilter,
  ] = useState<PagingTalkgroup | ''>('');

  const deleteModalUser = useCallback(async () => {
    if (!state.deleteUserModal) {
      return;
    }
    setIsDeleting(true);

    const apiBody: DeleteUserApi['params'] = {
      id: state.deleteUserModal.phone,
    };
    try {
      const [
        code,
        apiResponse,
      ] = await typeFetch<DeleteUserApi>({
        path: '/api/v2/users/{id}/',
        method: 'DELETE',
        params: apiBody,
      });

      if (
        code !== 200 ||
        apiResponse === null ||
        (
          'message' in apiResponse &&
          apiResponse.message !== 'Success'
        )
      ) {
        throw {
          code,
          apiResponse,
        };
      }

      dispatch({
        action: 'DeleteUser',
        phone: state.deleteUserModal.phone,
      });

      dispatch({
        action: 'ClearDeleteModal',
      });
    } catch (e) {
      logger.error(`Failed to delete user ${state.deleteUserModal}`, e);
      addAlert('danger', `Failed to delete ${state.deleteUserModal.fName} ${state.deleteUserModal.lName}`);
    }
  }, [
    state.deleteUserModal,
    addAlert,
  ]);

  const deleteModalDeps = state.deleteUserModal?.departments
    ?.filter(d => d.active).map(d => `${d.id} ${d.callSign}`) || [];

  const filteredUsers = state.users.filter(user => {
    if (departmentFilter !== '' && !user.departments?.some(d => d.id === departmentFilter && d.active)) {
      return false;
    }

    if (roleFilter === 'districtAdmin' && !user.isDistrictAdmin) {
      return false;
    }
    if (roleFilter === 'admin' && !user.departments?.some(d => d.active && d.admin)) {
      return false;
    }
    if (roleFilter === 'user' && !user.departments?.some(d => d.active && !d.admin)) {
      return false;
    }

    if (canEditNamesFilter === 'yes' && !user.canEditNames) {
      return false;
    }
    if (canEditNamesFilter === 'no' && user.canEditNames) {
      return false;
    }

    const receivesAlerts = !!(user.getApiAlerts || user.getDtrAlerts || user.getVhfAlerts);
    if (receivesAlertsFilter === 'yes' && !receivesAlerts) {
      return false;
    }
    if (receivesAlertsFilter === 'no' && receivesAlerts) {
      return false;
    }

    if (
      talkgroupTextsFilter !== '' &&
      !user.talkgroups?.includes(talkgroupTextsFilter)
    ) {
      return false;
    }

    return true;
  });

  const adminDepartments = loggedInUser === null
    ? []
    : loggedInUser.departments?.filter(d => d.active && d.admin).map(d => d.id) || [];

  return <>
    {isLoading && <LoadingSpinner />}
    {!isLoading && (!state.users || state.users.length === 0) && <h1 className='text-center'>No users found</h1>}
    {state.users && state.users.length > 0 && <UsersDispatchContext.Provider value={dispatch}>
      <AladTecUsersContext.Provider value={aladTecUsers}>
        <Row className='mb-3 g-2'>
          {
            (adminDepartments.length > 1 || !!loggedInUser?.isDistrictAdmin) &&
            <Col xs={12} sm={6} md={3}>
              <Form.Select
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value as UserDepartment | '')}
                aria-label='Filter by department'
              >
                <option value=''>All Departments</option>
                {validDepartments.map(dep =>
                  <option key={dep} value={dep}>{departmentConfig[dep].shortName}</option>)}
              </Form.Select>
            </Col>
          }
          <Col xs={12} sm={6} md={3}>
            <Form.Select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
              aria-label='Filter by role'
            >
              <option value=''>All Roles</option>
              {!!loggedInUser?.isDistrictAdmin && <option value='districtAdmin'>District Admin</option>}
              <option value='admin'>Department Admin</option>
              <option value='user'>User</option>
            </Form.Select>
          </Col>
          { !!loggedInUser?.isDistrictAdmin && <Col xs={12} sm={6} md={3}>
            <Form.Select
              value={canEditNamesFilter}
              onChange={e => setCanEditNamesFilter(e.target.value as typeof canEditNamesFilter)}
              aria-label='Filter by can edit names'
            >
              <option value='all'>Can Edit Names: Any</option>
              <option value='yes'>Can Edit Names: Yes</option>
              <option value='no'>Can Edit Names: No</option>
            </Form.Select>
          </Col> }
          { !!loggedInUser?.isDistrictAdmin && <Col xs={12} sm={6} md={3}>
            <Form.Select
              value={receivesAlertsFilter}
              onChange={e => setReceivesAlertsFilter(e.target.value as typeof receivesAlertsFilter)}
              aria-label='Filter by receives alerts'
            >
              <option value='all'>Receives Alerts: Any</option>
              <option value='yes'>Receives Alerts: Yes</option>
              <option value='no'>Receives Alerts: No</option>
            </Form.Select>
          </Col> }
          <Col xs={12} sm={6} md={3}>
            <Form.Select
              value={talkgroupTextsFilter}
              onChange={e => setTalkgroupTextsFilter(e.target.value === ''
                ? ''
                : Number(e.target.value) as PagingTalkgroup)}
              aria-label='Filter by text talkgroup'
            >
              <option value=''>Receives Text Talkgroup: Any</option>
              {pagingTalkgroups.map(tg =>
                <option key={tg} value={tg}>
                  {pagingTalkgroupConfig[tg].partyBeingPaged} ({tg})
                </option>)}
            </Form.Select>
          </Col>
        </Row>
        <Table responsive={true}>
          <tbody>
            {filteredUsers.length === 0 && <tr>
              <td colSpan={4}>
                <h1 className='text-center'>No users found with filters</h1>
              </td>
            </tr>}
            {filteredUsers
              .map((user, idx) => <UserRow
                key={user.phone}
                user={user}
                idx={idx}
              />)}
            <UserRow
              user={null}
              idx={state.users.length}
            />
          </tbody>
        </Table>

        <Modal
          show={!!state.deleteUserModal}
          onHide={() => dispatch({
            action: 'ClearDeleteModal',
          })}
          size='lg'
        >
          <Modal.Header closeButton>Are you sure?</Modal.Header>

          <Modal.Body>
            Are you sure you want to delete
            <b>{state.deleteUserModal?.fName} {state.deleteUserModal?.lName} ({
              deleteModalDeps.length === 0
                ? 'No Department'
                : deleteModalDeps.join(', ')
            })</b>?
          </Modal.Body>

          <Modal.Footer className='justify-content-between'>
            <Button onClick={() => dispatch({
              action: 'ClearDeleteModal',
            })}>No, do not delete</Button>
            <Button
              variant='danger'
              onClick={() => deleteModalUser()}
            >{
                isDeleting
                  ? <><Spinner size='sm' /> Deleting User</>
                  : 'Yes, delete this user'
              }</Button>
          </Modal.Footer>
        </Modal>
      </AladTecUsersContext.Provider>
    </UsersDispatchContext.Provider>}
  </>;

}
