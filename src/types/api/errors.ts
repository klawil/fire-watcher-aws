import {
  api200Body, api400Body
} from '@/types/api/_shared';
import { Validator } from '@/types/backend/validation';

export interface ErrorTableItem {
  Datetime: number;
  Url: string;
  Message: string;
  Trace: string;
}

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
    200: typeof api200Body;

    /**
     * @contentType application/json
     */
    400: typeof api400Body;
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
