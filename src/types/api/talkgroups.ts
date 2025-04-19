import {
  api400Body, api401Body, api403Body, api404Body, api500Body
} from './_shared';

import { Validator } from '@/types/backend/validation';

export interface FullTalkgroupObject {
  ID: number;
  InUse?: 'Y' | 'N';
  Count?: number;

  /**
   * Map of device ID to number of times it has been seen transmitting on this talkgroup
   */
  Devices?: {
    [key: string]: number;
  };
  Name?: string;
}
type SmallTalkgroupObject = Omit<FullTalkgroupObject, 'Devices'>;

/**
 * Retrieve a list of talkgroups that match the given filters
 * @summary Retrieve Talkgroups List
 * @tags Talkgroups
 */
export type GetAllTalkgroupsApi = {
  path: '/api/v2/talkgroups/';
  method: 'GET';
  query: {

    /**
     * Pass 'y' to access all talkgroups. The default behavior is to only return talkgroups that
     * have recordings associated with them
     */
    all?: 'y';
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      count: number;
      loadedAll: boolean;
      talkgroups: SmallTalkgroupObject[];
    };

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

export const getAllTalkgroupsApiQueryValidator: Validator<GetAllTalkgroupsApi['query']> = {
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
 * Retrieve the metadata of a specific talkgroup
 * @summary Retrieve Talkgroup Information
 * @tags Talkgroups
 */
export type GetTalkgroupApi = {
  path: '/api/v2/talkgroups/{id}/';
  method: 'GET';
  params: {
    id: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: FullTalkgroupObject;

    /**
     * @contentType application/json
     */
    400: typeof api400Body;

    /**
     * @contentType application/json
     */
    404: typeof api404Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
};

/**
 * Update the name of a talkgroup
 * @summary Set Talkgroup Name
 * @tags Talkgroups
 * @body.contentType application/json
 * @contentType application/json
 */
export type PatchTalkgroupApi = {
  path: '/api/v2/talkgroups/{id}/';
  method: 'PATCH';
  params: {
    id: number;
  };
  body: {

    /**
     * New name for the talkgroup. Pass null to delete the name. Name may not contain newline or
     * tab characters
     */
    name: string | null;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: FullTalkgroupObject;

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

export const talkgroupParamsValidator: Validator<PatchTalkgroupApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};

export const talkgroupBodyValidator: Validator<PatchTalkgroupApi['body']> = {
  name: {
    required: true,
    types: {
      string: {
        regex: /^[^\n\t]+$/,
      },
      null: {},
    },
  },
};
