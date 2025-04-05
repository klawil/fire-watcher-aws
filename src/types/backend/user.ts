import { UserDepartment } from "../api/users";

export interface UserPermissions {
  isUser: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
  activeDepartments: UserDepartment[];
  adminDepartments: UserDepartment[];
}
