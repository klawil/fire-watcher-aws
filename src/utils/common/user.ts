import { FrontendUserObject, validDepartments } from "@/types/api/users";
import { UserPermissions } from "@/types/backend/user";

export function getUserPermissions(user: FrontendUserObject | null): UserPermissions {
  const userPerms: UserPermissions = {
    isUser: false,
    isAdmin: false,
    isDistrictAdmin: false,
    activeDepartments: [],
    adminDepartments: [],
  };
  if (user === null) return userPerms;

  // Determine the permissions
  userPerms.activeDepartments = validDepartments.filter(dep => user[dep]?.active);
  userPerms.adminDepartments = userPerms.activeDepartments.filter(dep => user[dep]?.admin);
  userPerms.isUser = userPerms.activeDepartments.length > 0;
  userPerms.isAdmin = userPerms.adminDepartments.length > 0;
  userPerms.isDistrictAdmin = !!user.isDistrictAdmin;

  return userPerms;
}
