import { UserDepartment } from '@/types/api/users';

export interface UserPermissions {
  isUser: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
  canEditNames: boolean;
  activeDepartments: UserDepartment[];
  adminDepartments: UserDepartment[];
}
