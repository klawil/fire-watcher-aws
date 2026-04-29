import {
  FrontendUserObject
} from '@/types/api/users';
import { UserPermissions } from '@/types/backend/user';

export function getUserPermissions(user: FrontendUserObject | null): UserPermissions {
  const userPerms: UserPermissions = {
    isUser: false,
    isAdmin: false,
    isDistrictAdmin: false,
    canEditNames: false,
    activeDepartments: [],
    adminDepartments: [],
  };
  if (user === null) {
    return userPerms;
  }

  // Determine the permissions
  userPerms.activeDepartments = user.departments?.filter(d => d.active).map(d => d.id) || [];
  userPerms.adminDepartments = user.departments?.filter(d => d.active && d.admin)
    .map(d => d.id) || [];
  userPerms.isUser = userPerms.activeDepartments.length > 0;
  userPerms.isAdmin = userPerms.adminDepartments.length > 0;
  userPerms.isDistrictAdmin = userPerms.isUser && !!user.isDistrictAdmin;
  userPerms.canEditNames = userPerms.isDistrictAdmin || user.canEditNames || false;

  return userPerms;
}
