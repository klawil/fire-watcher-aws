import { createContext } from 'react';

import { FrontendUserObject } from '@/types/api/users';
import {
  UserActions, UsersState
} from '@/types/frontend/users';

export const UsersDispatchContext = createContext<
  React.ActionDispatch<[action: UserActions]>
>(() => {});

export const defaultUsersState: UsersState = {
  users: [],
};

function sortUsers(users: FrontendUserObject[]): FrontendUserObject[] {
  return users.sort((a, b) => {
    if (a.lName === b.lName) {
      return (a.fName || '') > (b.fName || '') ? 1 : -1;
    }

    return (a.lName || '') > (b.lName || '') ? 1 : -1;
  });
}

export function usersStateReducer(
  state: UsersState,
  action: UserActions
): UsersState {
  switch (action.action) {
    case 'SetUsers': {
      return {
        ...state,
        users: sortUsers(action.users),
      };
    }
    case 'UpdateUser': {
      return {
        ...state,
        users: sortUsers(state.users.map(u => ({
          ...u,
          ...u.phone === action.phone
            ? action.user
            : {},

        }))),
      };
    }
    case 'ReplaceUser': {
      return {
        ...state,
        users: sortUsers(state.users.map(u => u.phone === action.phone
          ? {
            ...action.user,
          }
          : u)),
      };
    }
    case 'DeleteUser': {
      return {
        ...state,
        users: state.users.filter(u => u.phone !== action.phone),
      };
    }
    case 'AddUser': {
      return {
        ...state,
        users: sortUsers([
          ...state.users,
          action.user,
        ]),
      };
    }

    case 'SetDeleteModal': {
      return {
        ...state,
        deleteUserModal: action.user,
      };
    }
    case 'ClearDeleteModal': {
      return {
        ...state,
        deleteUserModal: undefined,
      };
    }
  }
}
