import { UserDepartment } from "@/types/api/users";

export interface UserPermissions {
  isUser: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
  activeDepartments: UserDepartment[];
  adminDepartments: UserDepartment[];
}
