import {
  api200Body, api400Body, api401Body, api403Body, api404Body, api500Body
} from './_shared';
import { FullFileObject } from './files';

import { Validator } from '@/types/backend/validation';

/**
 * Event types supported by V2 Glue table
 */
export const validEventTypes = [
  'GRANT',
  'LOCATION',
  'AFFILIATION',
  'REGISTRATION',
  'ACKNOWLEDGE',
  'DEREGISTRATION',
  'DATA_GRANT',
] as const;
export type EventType = typeof validEventTypes[number];

/**
 * Event item from V2 Glue table
 */
export type EventItem = {
  event: EventType;
  datetime: string;
  system: string;
  source: number;
  opcode?: number;
  priority?: number;
  encrypted?: boolean;
  emergency?: boolean;
  freq?: number;
  talkgroup?: number;
  duplex?: boolean;
  mode?: boolean;
  phase2_tdma?: boolean;
  tdma_slot?: number;
};

export type AddEventItem = Omit<EventItem, 'datetime'> & {
  timestamp: number;
};

/**
 * Group-by keys for event queries (only fields present in V2 table)
 */
export type GroupKey = 'event' | 'system' | 'source' | 'talkgroup' | 'freq' | 'priority' | 'opcode' | 'encrypted' | 'emergency';
export const validGroupKeys: GroupKey[] = [
  'event',
  'system',
  'source',
  'talkgroup',
  'freq',
  'priority',
  'opcode',
  'encrypted',
  'emergency',
];

/**
 * Query result row for group-by queries
 */
export type EventQueryResultRow = {
  [key in GroupKey]?: string;
} & {
  num: number;
};

/**
 * File event item (for backward compatibility with file storage)
 */
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
    groupBy?: GroupKey[];
    timeframe?: 'day' | 'week' | 'month';
    events?: EventType[];
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
 * Push DTR events into the firehose
 * @summary Push DTR events
 * @tags Events
 * @body.contentType application/json
 */
export type AddEventsApi = {
  path: '/api/v2/events/';
  method: 'POST';
  body: AddEventItem[];
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
      events: EventItem[];
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
          'GRANT',
          'LOCATION',
          'AFFILIATION',
          'REGISTRATION',
          'ACKNOWLEDGE',
          'DEREGISTRATION',
          'DATA_GRANT',
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
          'system',
          'source',
          'talkgroup',
          'freq',
          'priority',
          'opcode',
          'encrypted',
          'emergency',
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

export const eventItemValidator: Validator<AddEventItem> = {
  event: {
    required: true,
    types: {
      string: {
        exact: [
          'GRANT',
          'LOCATION',
          'AFFILIATION',
          'REGISTRATION',
          'ACKNOWLEDGE',
          'DEREGISTRATION',
          'DATA_GRANT',
        ],
      },
    },
  },
  timestamp: {
    required: true,
    types: {
      number: {},
    },
  },
  system: {
    required: true,
    types: {
      string: {},
    },
  },
  source: {
    required: true,
    types: {
      number: {
        max: 2147483647,
      },
    },
  },
  opcode: {
    required: false,
    types: {
      number: {
        min: 0,
        max: 64,
      },
    },
  },
  priority: {
    required: false,
    types: {
      number: {
        max: 127,
      },
    },
  },
  encrypted: {
    required: false,
    parse: (v: string) => v === 'true' || v === '1',
    types: {
      boolean: {},
    },
  },
  emergency: {
    required: false,
    parse: (v: string) => v === 'true' || v === '1',
    types: {
      boolean: {},
    },
  },
  freq: {
    required: false,
    types: {
      number: {
        min: 0,
        max: 2147483647,
      },
    },
  },
  talkgroup: {
    required: false,
    types: {
      number: {
        max: 2147483647,
      },
    },
  },
  duplex: {
    required: false,
    parse: (v: string) => v === 'true' || v === '1',
    types: {
      boolean: {},
    },
  },
  mode: {
    required: false,
    parse: (v: string) => v === 'true' || v === '1',
    types: {
      boolean: {},
    },
  },
  phase2_tdma: {
    required: false,
    parse: (v: string) => v === 'true' || v === '1',
    types: {
      boolean: {},
    },
  },
  tdma_slot: {
    required: false,
    types: {
      number: {
        max: 2147483647,
      },
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
