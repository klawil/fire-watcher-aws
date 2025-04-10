import {
  api400Body, api401Body, api403Body, api500Body
} from './_shared';

import { TwilioAccounts } from '@/types/backend/department';
import { Validator } from '@/types/backend/validation';

export interface BillingItem {
  type: 'aws' | 'twilio';
  cat: string;
  price: number;
  usage: number;
  usageUnit: string;
}

/**
 * Get a departments bill
 * @summary Get Department Bill
 * @tags Departments
 * @body.contentType application/json
 */
export type GetDepartmentApi = {
  path: '/api/v2/department/{id}/';
  method: 'GET';
  params: { id: Exclude<TwilioAccounts, ''> | 'all'; }
  query: { month?: 'this' | 'last'; };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      start: string;
      end: string;
      items: BillingItem[];
    };

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

export const getDepartmentApiParamsValidator: Validator<GetDepartmentApi['params']> = {
  id: {
    required: true,
    types: {
      string: {
        exact: [
          'all',
          'Baca',
          'Crestone',
          'NSCAD',
          'Saguache',
        ],
      },
    },
  },
};

export const getDepartmentApiQueryValidator: Validator<GetDepartmentApi['query']> = {
  month: {
    required: false,
    types: {
      string: {
        exact: [
          'last',
          'this',
        ],
      },
    },
  },
};
