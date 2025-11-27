import { TypedQueryOutput } from '../backend/dynamo';
import { Validator } from '../backend/validation';

import {
  api400Body, api401Body, api500Body
} from './_shared';
import { FullFileObject } from './files';
import {
  PagingTalkgroup, pagingTalkgroups
} from './users';

/**
 * Retrieve a list of pages that match the given filters
 * @summary Retrieve Pages List
 * @tags Pages
 */
export type GetPagesApi = {
  path: '/api/v2/pages/';
  method: 'GET';
  query: {

    /**
     * The talkgroup(s) to retrieve files from. This should be a pipe-separated list of integers
     */
    tg?: PagingTalkgroup[];

    /**
     * Return files that started before this number
     */
    before?: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      before: number | null;
      files: FullFileObject[];
      query: TypedQueryOutput<FullFileObject>;
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
    500: typeof api500Body;
  };
};

export const getPagesApiQueryValidator: Validator<GetPagesApi['query']> = {
  tg: {
    required: false,
    parse: v => Number(v) as PagingTalkgroup,
    types: {
      array: {
        exact: [ ...pagingTalkgroups, ],
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
