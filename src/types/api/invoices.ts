import {
  api400Body, api401Body, api403Body, api500Body
} from './_shared';

import { TwilioAccounts } from '@/types/backend/department';
import { Validator } from '@/types/backend/validation';

export interface InvoiceItem {
  type: 'aws' | 'twilio';
  cat: string;
  price: number;
  usage: number;
  usageUnit: string;
}

export interface Invoice {
  id: string;
  department?: string;
  total?: number;
  startDate?: string;
  endDate?: string;
  generatedDate?: string;
  paidDate?: string;
  s3Location?: string;
}

/**
 * List invoices with filters
 * @summary List Invoices
 * @tags Invoices
 * @body.contentType application/json
 */
export type ListInvoicesApi = {
  path: '/api/v2/invoices/';
  method: 'GET';
  query: {
    department?: Exclude<TwilioAccounts, ''> | 'all';

    /**
     * Find invoices with an end date before this date, format YYYY-MM-DD
     */
    before?: string;

    /**
     * Find invoices with a start date after this date, format YYYY-MM-DD
     */
    after?: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      lastItem: string | null;
      invoices: Invoice[];
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

/**
 * Get a specific invoice's PDF file
 * @summary Get Invoice
 * @tags Invoices
 * @body.contentType application/json
 */
export type GetInvoiceApi = {
  path: '/api/v2/invoices/{id}/';
  method: 'GET';
  params: { id: string; }
  responses: {

    /**
     * @contentType application/pdf
     */
    200: Buffer;

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
 * Get a departments invoiced items for a given time period
 * @summary Get Invoice Items
 * @tags Invoices
 * @body.contentType application/json
 */
export type GetInvoiceItemsApi = {
  path: '/api/v2/invoices/{department}/items/';
  method: 'GET';
  params: { department: Exclude<TwilioAccounts, ''> | 'all'; }
  query: {
    month?: 'this' | 'last';

    /**
     * First day to report data for, format YYYY-MM-DD
     */
    startDate?: string;

    /**
     * Day to end data on (goes until midnight on this day) YYYY-MM-DD
     */
    endDate?: string;

    /**
     * Whether to group data by day or month, default is no grouping (all data in one bucket)
     */
    by?: 'day' | 'month' | 'all';
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      start: string;
      end: string;
      items: InvoiceItem[];
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

export const getInvoiceItemsApiParamsValidator: Validator<GetInvoiceItemsApi['params']> = {
  department: {
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

export const getInvoiceItemsApiQueryValidator: Validator<GetInvoiceItemsApi['query']> = {
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
  startDate: {
    required: false,
    types: {
      string: {
        regex: /[0-9]{4}-[0-9]{2}-[0-9]{2}/,
      },
    },
  },
  endDate: {
    required: false,
    types: {
      string: {
        regex: /[0-9]{4}-[0-9]{2}-[0-9]{2}/,
      },
    },
  },
  by: {
    required: false,
    types: {
      string: {
        exact: [
          'day',
          'month',
          'all',
        ],
      },
    },
  },
};
