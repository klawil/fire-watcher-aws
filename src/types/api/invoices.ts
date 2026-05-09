import {
  api302Body,
  api400Body, api401Body, api403Body, api404Body, api500Body
} from './_shared';

import {
  TwilioAccounts,
  validPhoneNumberAccounts
} from '@/types/backend/department';
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
  dueDate?: string;
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const invoiceIdRegex = /^[A-Za-z0-9_-]+$/;
const invoiceDepartmentsRegex = /^[^,]+(?:,[^,]+)*$/;

function normalizeInvoiceDepartments(value: string) {
  const departments = value.split(',')
    .map(v => v.trim());

  if (departments.some(v => v.length === 0)) {
    return '';
  }

  return departments.join(',');
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
    departments?: string;

    /**
     * Find invoices with an end date before this date, format YYYY-MM-DD
     */
    before?: string;

    /**
     * Find invoices with a start date after this date, format YYYY-MM-DD
     */
    after?: string;

    /**
     * Maximum invoices returned in a single response
     */
    limit?: number;

    /**
     * Base64-encoded pagination cursor returned from the previous request
     */
    lastKey?: string;
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

export const listInvoicesApiQueryValidator: Validator<ListInvoicesApi['query']> = {
  department: {
    required: false,
    types: {
      string: {
        exact: [
          'all',
          ...validPhoneNumberAccounts,
        ],
      },
    },
  },
  departments: {
    required: false,
    parse: normalizeInvoiceDepartments,
    types: {
      string: {
        regex: invoiceDepartmentsRegex,
      },
    },
  },
  before: {
    required: false,
    types: {
      string: {
        regex: dateRegex,
      },
    },
  },
  after: {
    required: false,
    types: {
      string: {
        regex: dateRegex,
      },
    },
  },
  limit: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
  lastKey: {
    required: false,
    types: {
      string: {},
    },
  },
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
     * Redirect to a pre-signed S3 URL for the invoice PDF. The URL is valid for 1 minute.
     */
    302: typeof api302Body;

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

export const invoiceApiParamsValidator: Validator<GetInvoiceApi['params']> = {
  id: {
    required: true,
    types: {
      string: {
        regex: invoiceIdRegex,
      },
    },
  },
};

/**
 * Update invoice paid status
 * @summary Update Invoice
 * @tags Invoices
 * @body.contentType application/json
 */
export type UpdateInvoiceApi = {
  path: '/api/v2/invoices/{id}/';
  method: 'PATCH';
  params: { id: string; };
  body: {

    /**
     * Date the invoice was paid, format YYYY-MM-DD. Set to null to unmark as paid.
     */
    paidDate?: string | null;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: Invoice;

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

export const updateInvoiceApiBodyValidator: Validator<UpdateInvoiceApi['body']> = {
  paidDate: {
    required: false,
    types: {
      string: {
        regex: dateRegex,
      },
      null: {},
    },
  },
};

/**
 * Get invoice itemized costs for the invoice's department in a given time period
 * @summary Get Invoice Items
 * @tags Invoices
 * @body.contentType application/json
 */
export type GetInvoiceItemsApi = {
  path: '/api/v2/invoices/{id}/items/';
  method: 'GET';
  params: { id: string; }
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

export const getInvoiceItemsApiParamsValidator: Validator<GetInvoiceItemsApi['params']> = {
  id: {
    required: true,
    types: {
      string: {
        regex: invoiceIdRegex,
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
