import { FrontendUserObject } from "@/common/apiv2/users";

export interface UsersState {
  users: FrontendUserObject[];
  deleteUserModal?: FrontendUserObject;
}

interface SetUsersAction {
  action: 'SetUsers';
  users: UsersState['users'];
}
interface UpdateUserAction {
  action: 'UpdateUser';
  phone: number;
  user: Partial<FrontendUserObject>;
}
interface ReplaceUserAction {
  action: 'ReplaceUser';
  phone: number;
  user: FrontendUserObject;
}
interface DeleteUserAction {
  action: 'DeleteUser';
  phone: number;
}
interface AddUserAction {
  action: 'AddUser';
  user: FrontendUserObject;
}
type UsersActions = SetUsersAction | UpdateUserAction | ReplaceUserAction | DeleteUserAction
  | AddUserAction;

interface SetDeleteModalAction {
  action: 'SetDeleteModal';
  user: UsersState['users'][number];
}
interface ClearDeleteModalAction {
  action: 'ClearDeleteModal';
}
type DeleteModalActions = SetDeleteModalAction | ClearDeleteModalAction;

export type UserActions = UsersActions | DeleteModalActions;
