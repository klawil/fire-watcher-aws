'use client';

import React, {
  useCallback, useContext, useEffect, useReducer, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import UserRow from '@/components/userRow/userRow';
import { GetAladtecUsersApi } from '@/types/api/aladtec';
import {
  DeleteUserApi, GetAllUsersApi, validDepartments
} from '@/types/api/users';
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

  const deleteModalDeps = validDepartments
    .filter(dep => state.deleteUserModal?.[dep]?.active)
    .map(dep => `${dep} ${state.deleteUserModal?.[dep]?.callSign}`);

  return <>
    {isLoading && <LoadingSpinner />}
    {!isLoading && (!state.users || state.users.length === 0) && <h1 className='text-center'>No users found</h1>}
    {state.users && state.users.length > 0 && <UsersDispatchContext.Provider value={dispatch}>
      <AladTecUsersContext.Provider value={aladTecUsers}>
        <Table responsive={true}>
          <tbody>
            {state.users
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
