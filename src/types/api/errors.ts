import {
  api400Body,
  api401Body,
  api403Body,
  api500Body
} from '@/types/api/_shared';
import { Validator } from '@/types/backend/validation';

export interface ErrorTableItem {
  Datetime: number;
  Url: string;
  Message: string;
  Trace: string;
  UserAgent: string;
}

/**
 * Retrieve a list of the last 100 errors that have been reported
 * @summary Retrieve Errors List
 * @tags Errors
 */
export type GetErrorsApi = {
  path: '/api/v2/errors/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      errors: ErrorTableItem[];
    };

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
    cookie: [];
  }];
};

/**
 * Sends an error message to the backend signaling a front-end error.
 * @summary Log Error Event
 * @tags Errors
 * @body.contentType application/json
 */
export type AddErrorApi = {
  path: '/api/v2/errors/';
  method: 'POST';
  body: {
    url: string;
    message: string;
    trace: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    400: typeof api400Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
};

export const errorItemValidator: Validator<AddErrorApi['body']> = {
  url: {
    required: true,
    types: {
      string: {},
    },
  },
  message: {
    required: true,
    types: {
      string: {},
    },
  },
  trace: {
    required: true,
    types: {
      string: {},
    },
  },
};
