import { UserObject } from "$/userApi";

export interface UsersState {
  users: (UserObject & {
    editRowOpen?: boolean;
  })[];
  deleteUserModal?: UserObject;
}

interface SetUsersAction {
  action: 'SetUsers';
  users: UsersState['users'];
}
interface SetUserEditRowAction {
  action: 'SetUserEditRow';
  phone: string;
  editRowOpen: boolean;
}
interface UpdateUserAction {
  action: 'UpdateUser';
  phone: string;
  user: Partial<UserObject>;
}
interface ReplaceUserAction {
  action: 'ReplaceUser';
  phone: string;
  user: UserObject;
}
interface DeleteUserAction {
  action: 'DeleteUser';
  phone: string;
}
interface AddUserAction {
  action: 'AddUser';
  user: UserObject;
}
type UsersActions = SetUsersAction | SetUserEditRowAction | UpdateUserAction | ReplaceUserAction
  | DeleteUserAction | AddUserAction;

interface SetDeleteModalAction {
  action: 'SetDeleteModal';
  user: UsersState['users'][number];
}
interface ClearDeleteModalAction {
  action: 'ClearDeleteModal';
}
type DeleteModalActions = SetDeleteModalAction | ClearDeleteModalAction;

export type UserActions = UsersActions | DeleteModalActions;
