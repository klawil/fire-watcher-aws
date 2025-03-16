'use client';

import { ApiUserListResponse, ApiUserUpdateBody } from "$/userApi";
import CofrnLayout from "@/components/layout";
import React, { useCallback, useEffect, useReducer, useState } from "react";
import LoadingSpinner from "@/components/loadingSpinner/loadingSpinner";
import Table from "react-bootstrap/Table";
import { defaultUsersState, UsersDispatchContext, usersStateReducer } from "@/logic/usersState";
import UserRow from "@/components/userRow/userRow";
import Modal from "react-bootstrap/Modal";
import { validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { ApiResponseBase } from "$/common";

export default function Page() {
  const [ state, dispatch ] = useReducer(usersStateReducer, defaultUsersState);

  useEffect(() => {
    (async () => {
      const apiResult: ApiUserListResponse = await fetch('/api/user?action=list')
        .then(r => r.json());

      if (!apiResult.success) return;

      dispatch({
        action: 'SetUsers',
        users: apiResult.users,
      });
    })();
  }, []);

  const [isDeleting, setIsDeleting] = useState(false);
  const deleteModalUser = useCallback(async () => {
    if (!state.deleteUserModal) return;
    setIsDeleting(true);

    const apiBody: ApiUserUpdateBody = {
      phone: state.deleteUserModal.phone.toString(),
    };
    try {
      const apiResponse: ApiResponseBase = await fetch(`/api/user?action=delete`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());

      if (apiResponse.success) {
        dispatch({
          action: 'DeleteUser',
          phone: state.deleteUserModal.phone,
        });

        dispatch({
          action: 'ClearDeleteModal',
        });
      } else {
        throw(apiResponse);
      }
    } catch (e) {
      console.error(`Failed to delete user ${state.deleteUserModal}`, e);
    }
  }, [state.deleteUserModal]);

  const deleteModalDeps = validDepartments
    .filter(dep => state.deleteUserModal?.[dep]?.active)
    .map(dep => `${dep} ${state.deleteUserModal?.[dep]?.callSign}`);

  return (<CofrnLayout
    pageConfig={{
      title: 'User Management',
    }}>
      {!state.users || state.users.length === 0
        ? <LoadingSpinner></LoadingSpinner>
        : <UsersDispatchContext.Provider value={dispatch}>
          <Table responsive={true}>
            <tbody>
              {state.users
                .map((user, idx) => (<UserRow
                  key={user.phone}
                  user={user}
                  idx={idx}
                />))}
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
            size="lg"
          >
            <Modal.Header closeButton>Are you sure?</Modal.Header>

            <Modal.Body>
              Are you sure you want to delete <b>{state.deleteUserModal?.fName} {state.deleteUserModal?.lName} ({
                deleteModalDeps.length === 0
                  ? 'No Department'
                  : deleteModalDeps.join(', ')
              })</b>?
            </Modal.Body>

            <Modal.Footer className="justify-content-between">
              <Button onClick={() => dispatch({
                action: 'ClearDeleteModal',
              })}>No, do not delete</Button>
              <Button
                variant="danger"
                onClick={() => deleteModalUser()}
              >{
                isDeleting
                  ? (<><Spinner size="sm" /> Deleting User</>)
                  : 'Yes, delete this user'
              }</Button>
            </Modal.Footer>
          </Modal>
        </UsersDispatchContext.Provider>}
    </CofrnLayout>
  )
}
