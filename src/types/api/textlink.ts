import { Validator } from '../backend/validation';

import {
  api302Body, api400Body
} from './_shared';
import {
  PagingTalkgroup,
  pagingTalkgroups
} from './users';

/**
 * Used to generate shorter links for text messages
 * @summary Text Link Redirector
 * @tags Texts
 * @body.contentType application/json
 */
export type TextLinkApi = {
  path: '/api/v2/textlink/';
  method: 'GET';
  query: {
    f: string;
    tg: PagingTalkgroup;
    t: '1' | '0';
    p?: number;
    m?: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    302: typeof api302Body;

    /**
     * @contentType application/json
     */
    400: typeof api400Body;
  };
};

export const textLinkApiValidator: Validator<TextLinkApi['query']> = {
  f: {
    required: true,
    types: {
      string: {},
    },
  },
  t: {
    required: true,
    types: {
      string: {
        exact: [
          '0',
          '1',
        ],
      },
    },
  },
  tg: {
    required: true,
    parse: v => Number(v) as PagingTalkgroup,
    types: {
      number: {
        exact: [ ...pagingTalkgroups, ],
      },
    },
  },
  p: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
  m: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};
