import { apiCodeValidator } from './_code';
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

export const validEventTypes = [
  'location',
  'on',
  'off',
  'join',
  'call',
  'data',
] as const;
type EventTypes = typeof validEventTypes[number];

type GroupKeys = keyof Omit<EventItem, 'talkgroupList' | 'timestamp'>;
export const validEventGroupKeys: GroupKeys[] = [
  'tower',
  'radioId',
  'event',
  'talkgroup',
];

export type EventQueryResultRow = {
  [key in GroupKeys]?: string;
} & {
  num: number;
};

export type FullEventItem = Required<Omit<EventItem, 'radioId'> & {
  radioid: string;
}>;

export type FileEventItem = Partial<Omit<FullFileObject, 'StartTime'>> & {
  RadioID: string;
  StartTime: number;
};

/**
 * Query DTR events
 * @summary Query DTR events
 * @tags Events
 */
export type QueryEventsApi = {
  path: '/api/v2/events/';
  method: 'GET';
  query: {
    groupBy?: GroupKeys[];
    timeframe?: 'day' | 'week' | 'month';
    events?: EventTypes[];
    queryId?: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      queryId: string;
      startTime: number;
      endTime: number;
    } | {
      status: string;
    } | {
      count: number;
      rows: EventQueryResultRow[];
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

/**
 * Push DTR events and details into the firehose
 * @summary Push DTR events
 * @tags Events
 * @body.contentType application/json
 */
export type AddEventsApi = {
  path: '/api/v2/events/';
  method: 'POST';
  query: {
    code: string;
  };
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
  query: {
    queryId?: string;

    /**
     * Retrieve events up to this time (in ms since epoch)
     */
    endTime?: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: ({
      count: number;
      events: (FullEventItem | FileEventItem)[];
      endTime: number;
      startTime: number;
    } | {
      queryId: string;
      endTime: number;
    } | {
      status: string;
    });

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

export const queryEventsQueryValidator: Validator<QueryEventsApi['query']> = {
  events: {
    required: false,
    types: {
      array: {
        exact: [
          'join',
          'location',
          'off',
          'on',
          'call',
          'data',
        ],
      },
    },
  },
  groupBy: {
    required: false,
    types: {
      array: {
        exact: [
          'event',
          'radioId',
          'talkgroup',
          'tower',
        ],
      },
    },
  },
  timeframe: {
    required: false,
    types: {
      string: {
        exact: [
          'day',
          'month',
          'week',
        ],
      },
    },
  },
  queryId: {
    required: false,
    types: {
      string: {},
    },
  },
};

export const addEventsQueryValidator: Validator<AddEventsApi['query']> = {
  ...apiCodeValidator,
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

export const getEventsQueryValidator: Validator<GetRadioEventsApi['query']> = {
  queryId: {
    required: false,
    types: {
      string: {},
    },
  },
  endTime: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};
