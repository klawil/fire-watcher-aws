import {
  describe, expect, it
} from 'vitest';

import * as mod from '@/utils/common/user';

describe('utils/common/user', () => {
  describe('getUserPermissions', () => {
    it('Returns the default values when no user is provided', () => {
      expect(mod.getUserPermissions(null)).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });
    });

    it('Returns the default values when an empty user is provided', () => {
      expect(mod.getUserPermissions({
        phone: 5555555555,
      })).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });
    });

    it('Returns the correct permissions for a user with only active departments', () => {
      expect(mod.getUserPermissions({
        phone: 5555555555,
        Baca: {
          active: true,
        },
      })).toEqual({
        isUser: true,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [ 'Baca', ],
        adminDepartments: [],
      });

      expect(mod.getUserPermissions({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        NSCAD: {
          active: true,
        },
      })).toEqual({
        isUser: true,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [
          'Baca',
          'NSCAD',
        ],
        adminDepartments: [],
      });
    });

    it('Returns the correct permissions for a user with mixed departments', () => {
      expect(mod.getUserPermissions({
        phone: 5555555555,
        Baca: {
          active: true,
          admin: true,
        },
      })).toEqual({
        isUser: true,
        isAdmin: true,
        isDistrictAdmin: false,
        activeDepartments: [ 'Baca', ],
        adminDepartments: [ 'Baca', ],
      });

      expect(mod.getUserPermissions({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        NSCAD: {
          active: true,
          admin: true,
        },
      })).toEqual({
        isUser: true,
        isAdmin: true,
        isDistrictAdmin: false,
        activeDepartments: [
          'Baca',
          'NSCAD',
        ],
        adminDepartments: [ 'NSCAD', ],
      });
    });

    it('Handles district admin role with true and false', () => {
      expect(mod.getUserPermissions({
        phone: 5555555555,
        isDistrictAdmin: true,
      })).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      expect(mod.getUserPermissions({
        phone: 5555555555,
        isDistrictAdmin: false,
      })).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      expect(mod.getUserPermissions({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        isDistrictAdmin: true,
      })).toEqual({
        isUser: true,
        isAdmin: false,
        isDistrictAdmin: true,
        activeDepartments: [ 'Baca', ],
        adminDepartments: [],
      });
    });
  });
});
