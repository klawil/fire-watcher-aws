import {
  api200Body, api400Body, api401Body, api403Body, api404Body, api500Body
} from './_shared';
import { FullFileObject } from './files';

import { Validator } from '@/types/backend/validation';

interface EventItem {
  tower: string;
  radioId: string;
  event: string;
  talkgroup: string;
  talkgroupList: string;
  timestamp?: number;
}

export type FullEventItem = Required<EventItem>;

export type FileEventItem = Partial<Omit<FullFileObject, 'StartTime'>> & {
  RadioID: string;
  StartTime: number;
};

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
 * Get DTR events associated with a radio ID
 * @summary Get Radio Events
 * @tags Events
 * @body.contentType application/json
 */
export type GetRadioEventsApi = {
  path: '/api/v2/events/radioid/{id}/';
  method: 'GET';
  params: {
    id: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      events: FullEventItem[];
      nextKey: string | null;
      queryId: string | null;
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
};

/**
 * Get DTR events associated with a Talkgroup
 * @summary Get Talkgroup Events
 * @tags Events
 * @body.contentType application/json
 */
export type GetTalkgroupEventsApi = Omit<GetRadioEventsApi, 'path'> & {
  path: '/api/v2/events/talkgroup/{id}/';
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
  timestamp: {
    required: false,
    types: {
      number: {},
    },
  },
};

export const getEventsParamsValidator: Validator<GetRadioEventsApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};
