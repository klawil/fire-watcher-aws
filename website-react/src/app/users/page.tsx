'use client';

import { ApiUserListResponse } from "$/userApi";
import CofrnLayout from "@/components/layout";
import React, { useEffect, useReducer } from "react";
import LoadingSpinner from "@/components/loadingSpinner/loadingSpinner";
import Table from "react-bootstrap/Table";
import { defaultUsersState, UsersDispatchContext, usersStateReducer } from "@/logic/usersState";
import UserRow from "@/components/userRow/userRow";

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
        </UsersDispatchContext.Provider>}
    </CofrnLayout>
  )
}
