import {
  api200Body, api400Body, api401Body, api403Body, api500Body
} from './_shared';
import {
  UserDepartment, validDepartments
} from './users';

import { Validator } from '@/types/backend/validation';

export const textTypes = [
  'page',
  'alert',
  'account',
  'transcript',
  'pageAnnounce',
  'department',
  'departmentAnnounce',
  'departmentAlert',
] as const;
export type TextTypes = typeof textTypes[number];
export interface FullTextObject {
  datetime: number;
  body?: string;

  // Only on pages section
  pageId?: string;

  /**
   * The phone numbers of the users who have opened the link to the page
   */
  csLooked?: number[];

  /**
   * Timestamps of when each person clicked the link the first time
   */
  csLookedTime?: number[];
  talkgroup?: number;

  /**
   * First letter - was this a test text message, second letter - was this a page
   */
  testPageIndex?: 'yy' | 'yn' | 'ny' | 'nn';
  type?: TextTypes;
  department?: UserDepartment;

  /**
   * Comma separated list of URLs that can be used to view media sent with the text
   */
  mediaUrls?: string | string[];

  recipients?: number;
  sent?: number[];
  sentPhone?: number[];
  delivered?: number[]; // Timestamp
  deliveredPhone?: number[]; // Phone #
  undelivered?: number[]; // Timestamp
  undeliveredPhone?: number[]; // Phone #
  fromNumber?: string;
  isPage?: boolean;
  isTest?: boolean;
}
export const allowedFrontendTextFields = [
  'datetime',
  'body',
  'pageId',
  'csLookedTime',
  'talkgroup',
  'testPageIndex',
  'type',
  'department',
  'mediaUrls',
  'recipients',
  'sent',
  'delivered',
  'undelivered',
  'fromNumber',
  'isPage',
  'isTest',
] as const;
export type FrontendTextObject = Pick<
  FullTextObject,
  typeof allowedFrontendTextFields[number]
>;

/**
 * Retrieve a list of files that match the given filters
 * @summary Retrieve Texts List
 * @tags Texts
 */
export type GetAllTextsApi = {
  path: '/api/v2/texts/';
  method: 'GET';
  query: {

    /**
     * The type of texts to retrieve
     */
    type?: TextTypes;

    /**
     * The department to retrieve texts from
     */
    department?: UserDepartment;

    /**
     * The timestamp to return messages before, in ms since epoch
     */
    before?: number;

    /**
     * Pass 'y' to return texts with 0 recipients
     */
    all?: 'y';
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      count: number;
      scanned: number;
      texts: FrontendTextObject[];
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

export const getAllTextsApiQueryValidator: Validator<GetAllTextsApi['query']> = {
  before: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
  type: {
    required: false,
    types: {
      string: {
        exact: textTypes,
      },
    },
  },
  department: {
    required: false,
    types: {
      string: {
        exact: validDepartments,
      },
    },
  },
  all: {
    required: false,
    types: {
      string: {
        exact: [ 'y', ],
      },
    },
  },
};

/**
 * Update which users have opened the link in the paging message
 * @summary Mark Text Opened
 * @tags Texts
 * @body.contentType application/json
 */
export type UpdateTextSeenApi = {
  path: '/api/v2/texts/{id}/';
  method: 'PATCH';
  params: {

    /**
     * The text ID that was opened
     */
    id: number;
  };
  body: {

    /**
     * The phone number that opened the message
     */
    phone: number;
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
    500: typeof api500Body;
  };
};

export const updateTextSeenApiParamsValidator: Validator<UpdateTextSeenApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};

export const updateTextSeenApiBodyValidator: Validator<UpdateTextSeenApi['body']> = {
  phone: {
    required: true,
    types: {
      number: {},
    },
  },
};
