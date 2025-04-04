import { api400Body, api401Body, api403Body, api500Body, Validator } from "./_shared";
import { UserDepartment } from "./users";

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
  type?: 'page' | 'department' | 'alert' | 'account' | 'transcript' | 'pageAnnounce';
  department?: UserDepartment;
  /**
   * Comma separated list of URLs that can be used to view media sent with the text
   */
  mediaUrls?: string;

  recipients?: number;
  sent?: number[];
  sentPhone?: number;
  delivered?: number[]; // Timestamp
  deliveredPhone?: number[]; // Phone #
  undelivered?: number[]; // Timestamp
  undeliveredPhone?: number[]; // Phone #
  fromNumber?: string;
  isPage?: boolean;
  isTest?: boolean;
  isTestString?: string;
}
export const omittedFrontendTextFields = [
  'csLooked',
  'sentPhone',
  'deliveredPhone',
  'undeliveredPhone',
] as const;
export type FrontendTextObject = Omit<
  FullTextObject,
  typeof omittedFrontendTextFields[number]
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
     * Send 'y' to only receive texts that are for pages, default is to return non-paging texts
     */
    page?: 'y';
    /**
     * The timestamp to return messages before, in ms since epoch
     * @format integer
     */
    before?: number;
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
}

export const getAllTextsApiQueryValidator: Validator<GetAllTextsApi['query']> = {
  page: {
    required: false,
    types: {
      string: {
        exact: [ 'y' ],
      },
    },
  },
  before: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};
