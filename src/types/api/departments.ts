import {
  Validator
} from '../backend/validation';

import {
  api400Body,
  api401Body, api403Body, api404Body, api500Body
} from './_shared';
import {
  PagingTalkgroup, pagingTalkgroups
} from './users';

export interface Department {
  id: string;
  name?: string;
  pagingTalkgroups?: PagingTalkgroup[];
  type?: 'text' | 'page';
  invoiceFrequency?: 'monthly' | 'annually';
  invoiceEmail?: string[];
}

/**
 * Retrieve a list of departments that the current user has access to
 * @summary Retrieve Department List
 * @tags Departments
 */
export type ListDepartmentApi = {
  path: '/api/v2/departments/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: Department[];

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
};

/**
 * Create a new department
 * @summary Create Department
 * @tags Departments
 * @body.contentType application/json
 */
export type CreateDepartmentApi = {
  path: '/api/v2/departments/';
  method: 'POST';
  body: Required<Department>;
  responses: {

    /**
     * @contentType application/json
     */
    200: Department;

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
};

/**
 * Retrieve a specific department
 * @summary Retrieve Department Information
 * @tags Departments
 */
export type GetDepartmentApi = {
  path: '/api/v2/departments/{id}/';
  method: 'GET';
  params: {

    /**
     * The department ID
     */
    id: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: Department;

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
};

/**
 * Update a departments's information
 * @summary Update Department
 * @tags Departments
 * @body.contentType application/json
 */
export type UpdateDepartmentApi = {
  path: '/api/v2/departments/{id}/';
  method: 'PATCH';
  params: {

    /**
     * The department ID
     */
    id: string;
  };
  body: Omit<
    Department,
    'id'
  >;
  responses: {

    /**
     * @contentType application/json
     */
    200: Department;

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
};

const departmentIdRegex = /^[a-zA-Z0-9-]+$/;
const departmentNameRegex = /^[ a-zA-Z0-9_-]+$/;

export const createDepartmentApiBodyValidator: Validator<CreateDepartmentApi['body']> = {
  id: {
    required: true,
    types: {
      string: {
        regex: departmentIdRegex,
      },
    },
  },
  name: {
    required: true,
    types: {
      string: {
        regex: departmentNameRegex,
      },
    },
  },
  pagingTalkgroups: {
    required: true,
    types: {
      array: {
        exact: [ ...pagingTalkgroups, ],
      },
    },
  },
  type: {
    required: true,
    types: {
      string: {
        exact: [
          'text',
          'page',
        ],
      },
    },
  },
  invoiceFrequency: {
    required: true,
    types: {
      string: {
        exact: [
          'monthly',
          'annually',
        ],
      },
    },
  },
  invoiceEmail: {
    required: true,
    types: {
      array: {
        regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      },
    },
  },
};

export const departmentApiParamsValidator: Validator<GetDepartmentApi['params']> = {
  id: {
    required: true,
    types: {
      string: {
        regex: departmentIdRegex,
      },
    },
  },
};

export const updateDepartmentApiBodyValidator: Validator<UpdateDepartmentApi['body']> = {
  name: {
    required: false,
    types: {
      string: {
        regex: departmentNameRegex,
      },
    },
  },
  pagingTalkgroups: {
    required: false,
    types: {
      array: {
        exact: [ ...pagingTalkgroups, ],
      },
    },
  },
  type: {
    required: false,
    types: {
      string: {
        exact: [
          'text',
          'page',
        ],
      },
    },
  },
  invoiceFrequency: {
    required: false,
    types: {
      string: {
        exact: [
          'monthly',
          'annually',
        ],
      },
    },
  },
  invoiceEmail: {
    required: false,
    types: {
      array: {
        regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      },
    },
  },
};
