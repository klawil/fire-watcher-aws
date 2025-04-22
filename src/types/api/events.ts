import {
  api200Body, api400Body, api401Body, api500Body
} from './_shared';

import { Validator } from '@/types/backend/validation';

interface EventItem {
  tower: string;
  radioId: string;
  event: string;
  talkgroup: string;
  talkgroupList: string;
}

/**
 * Push DTR events and details into the firehose
 * @summary Push DTR events
 * @tags Events
 * @body.contentType application/json
 */
export type AddEventsApi = {
  path: '/api/v2/events/';
  method: 'POST';
  body: EventItem[];
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
    401: typeof api401Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    apiKey: [];
  }];
};

/**
 * Push DTR events and details into the firehose
 * @summary Push DTR events
 * @tags Events
 * @body.contentType application/json
 */
export type OldEventsApi = Omit<AddEventsApi, 'path'> & {
  path: '/api/events';
  query: {
    action: 'events';
  };
};

export const eventItemValidator: Validator<EventItem> = {
  tower: {
    required: true,
    types: {
      string: {},
    },
  },
  event: {
    required: true,
    types: {
      string: {},
    },
  },
  radioId: {
    required: true,
    types: {
      string: {
        regex: /^\-?[0-9]+$/,
      },
    },
  },
  talkgroup: {
    required: true,
    types: {
      string: {
        regex: /^[0-9]*$/,
      },
    },
  },
  talkgroupList: {
    required: true,
    types: {
      string: {
        regex: /^[0-9]*(,[0-9]*)*$/,
      },
    },
  },
};
