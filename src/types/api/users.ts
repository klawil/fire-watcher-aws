import { PhoneNumberAccount } from "../backend/department";
import { api200Body, api400Body, api401Body, api403Body, api404Body, api500Body, OrNull, Validator } from "./_shared";

export const validDepartments = [
  'Baca',
  'Crestone',
  'NSCAD',
  'PageOnly',
  'Saguache',
] as const;
export type UserDepartment = typeof validDepartments[number];

export const pagingTalkgroups = [
	8332,
	18332,
	18331,
	8198,
	8334,
	8281,
	8181,
] as const;
export type PagingTalkgroup = typeof pagingTalkgroups[number];

export type FullUserObject = {
  phone: number;
  fName?: string;
  lName?: string;
  /**
   * The department the user's paging texts should be associated with
   */
  pagingPhone?: PhoneNumberAccount;

  getTranscript?: boolean;
  getApiAlerts?: boolean;
  getDtrAlerts?: boolean;
  getVhfAlerts?: boolean;
  isDistrictAdmin?: boolean;
  isTest?: boolean;

  lastLogin?: number;
  /**
   * The last status for a text sent to this user's phone number
   */
  lastStatus?: 'delivered' | 'undelivered';
  lastStatusCount?: number;

  /**
   * The talkgroups the user should receive pages from
   */
  talkgroups?: PagingTalkgroup[];
  
  /**
   * Tokens used to authenticate the user (@TODO - deprecate in favor of JWT)
   */
  loginTokens?: {
    token: string;
    tokenExpiry: number;
  }[];

  // Temporary code for user login
  code?: string;
  codeExpiry?: number;
} & {
  [key in UserDepartment]?: {
    active?: boolean;
    admin?: boolean;
    callSign?: string;
  };
};
export type FrontendUserObject = Omit<
  FullUserObject,
  'loginTokens' | 'code' | 'codeExpiry'
>;
interface MinimumUserState {
  fromApi: boolean;
  isUser: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
}
export interface FrontendUserState extends Partial<Omit<FrontendUserObject, keyof MinimumUserState>>, MinimumUserState {}

declare global { interface ReadonlyArray<T> { includes<U>(searchElement: (T & U) extends never ? never : U, fromIndex?: number): boolean } }

export const adminUserKeys = [
  'fName',
  'lName',
  'phone',
  'talkgroups',
  'lastLogin',
  'getTranscript',
  ...validDepartments,
] as const;
export const districtAdminUserKeys = [
  ...adminUserKeys,
  'getApiAlerts',
  'getVhfAlerts',
  'getDtrAlerts',
  'isDistrictAdmin',
  'pagingPhone',
] as const;

/**
 * Retrieve a list of users that the current user has access to
 * @summary Retrieve Users List
 * @tags Users
 */
export type GetAllUsersApi = {
  path: '/api/v2/users/';
  method: 'GET';
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject[];
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

/**
 * Create a new user (or add a department to an existing user if this one exists)
 * @summary Create User
 * @tags Users
 * @body.contentType application/json
 */
export type CreateUserApi = {
  path: '/api/v2/users/';
  method: 'POST';
  body: Required<Pick<
    FrontendUserObject,
    'phone' | 'talkgroups' | 'fName' | 'lName'
  >> & Pick<
    FrontendUserObject,
    'getTranscript' | 'getApiAlerts' | 'getVhfAlerts' | 'getDtrAlerts' | 'isDistrictAdmin' | 'pagingPhone'
  > & {
    department: UserDepartment;
    admin?: boolean;
    callSign: string;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

/**
 * Retrieve a specific user
 * @summary Retrieve User Information
 * @tags Users
 */
export type GetUserApi = {
  path: '/api/v2/users/{id}/';
  method: 'GET';
  params: {
    /**
     * The user ID (10 digit phone number) or "current" to retrieve the current user's information
     * @format integer
     */
    id: number | string;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    404: typeof api404Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

export const userApiParamsValidator: Validator<GetUserApi['params']> = {
  id: {
    required: true,
    parse: v => v === 'current' ? 'current' : Number(v),
    types: {
      string: {
        exact: [ 'current' ],
      },
      number: {
        regex: /^[0-9]{10}$/,
      },
    },
  },
}

/**
 * Update a user's core information (not department)
 * @summary Update User
 * @tags Users
 * @body.contentType application/json
 */
export type UpdateUserApi = {
  path: '/api/v2/users/{id}/';
  method: 'PATCH';
  params: {
    /**
     * The user ID (10 digit phone number) or "current" to update the current user's information
     * @format integer
     */
    id: number | string;
  };
  body: OrNull<Pick<
    FrontendUserObject,
    'talkgroups' | 'fName' | 'lName' | 'getTranscript' | 'getApiAlerts' | 'getVhfAlerts'
    | 'getDtrAlerts' | 'isDistrictAdmin' | 'pagingPhone'
  >>;
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    404: typeof api404Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

export const updateUserApiBodyValidator: Validator<UpdateUserApi['body']> = {
  fName: {
    required: false,
    types: {
      string: {},
      null: {},
    },
  },
  lName: {
    required: false,
    types: {
      string: {},
      null: {},
    },
  },
  getTranscript: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  getApiAlerts: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  getVhfAlerts: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  getDtrAlerts: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  isDistrictAdmin: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  pagingPhone: {
    required: false,
    types: {
      string: {
        exact: validDepartments,
      },
      null: {},
    },
  },
  talkgroups: {
    required: false,
    types: {
      array: {
        exact: pagingTalkgroups,
      },
      null: {},
    },
  },
};

export const createUserApiBodyValidator: Validator<CreateUserApi['body']> = {
  fName: {
    required: true,
    types: {
      string: {},
    },
  },
  lName: {
    required: true,
    types: {
      string: {},
    },
  },
  getTranscript: {
    required: false,
    types: {
      boolean: {},
    },
  },
  getApiAlerts: {
    required: false,
    types: {
      boolean: {},
    },
  },
  getVhfAlerts: {
    required: false,
    types: {
      boolean: {},
    },
  },
  getDtrAlerts: {
    required: false,
    types: {
      boolean: {},
    },
  },
  isDistrictAdmin: {
    required: false,
    types: {
      boolean: {},
    },
  },
  pagingPhone: {
    required: false,
    types: {
      string: {
        exact: validDepartments,
      },
    },
  },
  talkgroups: {
    required: true,
    types: {
      array: {
        exact: pagingTalkgroups,
      },
    },
  },
  phone: {
    required: true,
    types: {
      number: {
        regex: /^[0-9]{10}$/,
      },
    },
  },
  department: {
    required: true,
    types: {
      string: {
        exact: validDepartments,
      },
    },
  },
  admin: {
    required: false,
    types: {
      boolean: {},
    },
  },
  callSign: {
    required: true,
    types: {
      string: {
        regex: /^[^\t\n]+$/,
      },
    },
  },
};

/**
 * Delete a user
 * @summary Delete User
 * @tags Users
 */
export type DeleteUserApi = {
  path: '/api/v2/users/{id}/';
  method: 'DELETE';
  params: {
    /**
     * The user ID (10 digit phone number)
     * @format integer
     */
    id: number;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: typeof api200Body;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    404: typeof api404Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

/**** DEPARTMENT APIS ****/

/**
 * Add a user department
 * @summary Add User Department
 * @tags Users/Department
 * @body.contentType application/json
 */
export type CreateUserDepartmentApi = {
  path: '/api/v2/users/{id}/{department}/';
  method: 'POST';
  params: {
    /**
     * The user ID (10 digit phone number)
     * @format integer
     */
    id: number;
    /**
     * The department to make the association with
     */
    department: UserDepartment;
  };
  body: {
    /**
     * Is the user active in this department?
     */
    active?: boolean | null;
    /**
     * Is the user an administrator for this department?
     */
    admin?: boolean | null;
    /**
     * The user's call sign for this department. String without spaces or special characters except
     * dashes
     */
    callSign?: string;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    404: typeof api404Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}

export const userDepartmentApiParamsValidator: Validator<CreateUserDepartmentApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {
        regex: /^[0-9]{10}$/,
      },
    },
  },
  department: {
    required: true,
    types: {
      string: {
        exact: validDepartments,
      },
    },
  },
};

export const createUserDepartmentApiBodyValidator: Validator<CreateUserDepartmentApi['body']> = {
  active: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  admin: {
    required: false,
    types: {
      boolean: {},
      null: {},
    },
  },
  callSign: {
    required: false,
    types: {
      string: {
        regex: /^[^\t\n]+$/,
      },
    },
  },
};

/**
 * Update a users department
 * @summary Change User Department
 * @tags Users/Department
 * @body.contentType application/json
 */
export type UpdateUserDepartmentApi = {
  path: CreateUserDepartmentApi['path'];
  method: 'PATCH';
  params: CreateUserDepartmentApi['params'];
  body: CreateUserDepartmentApi['body'];
  responses: CreateUserDepartmentApi['responses'];
  security: CreateUserDepartmentApi['security'];
}

/**
 * Delete a user's department affiliation
 * @summary Delete User Department
 * @tags Users/Department
 */
export type DeleteUserDepartmentApi = {
  path: '/api/v2/users/{id}/{department}/';
  method: 'DELETE';
  params: {
    /**
     * The user ID (10 digit phone number)
     * @format integer
     */
    id: number;
    /**
     * The department to make the association with
     */
    department: UserDepartment;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    401: typeof api401Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    404: typeof api404Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
}
