import {
  api400Body, api401Body, api403Body, api500Body
} from './_shared';

import { Validator } from '@/types/backend/validation';

export interface TimingMetric {
  type: 'timing';
  label: string;
  namespace: 'Twilio Health' | 'DTR Metrics';
  metricName: 'UploadTime' | 'SentTime' | 'DeliveredTime' | 'PageDuration' | 'PageToQueue' | 'Decode Rate';
  tower?: 'Saguache' | 'PoolTable' | 'SanAntonio';
  stat: 'Minimum' | 'Maximum' | 'SampleCount' | 'p50' | 'p80';
}
export interface CountMetric {
  type: 'count';
  label: string;
  namespace: 'CVFD API' | 'VHF Metrics' | 'Twilio Health';
  metricName: 'Call' | '120-home' | 'cvfd-station' | 'Initiated';
  source?: 'S3';
  action?: 'createDTR' | 'createVHF';
}
export interface LambdaMetric {
  type: 'lambda';
  fn: string | 'all';
  metric: 'Invocations' | 'Errors' | 'Duration';
  stat: 'p50' | 'Maximum' | 'Minimum' | 'Sum';
}
export type MetricToFetch = TimingMetric | CountMetric | LambdaMetric;

/**
 * Retrieve one or more metrics
 * @summary Retrieve Metrics
 * @tags Metrics
 * @body.contentType application/json
 */
export type GetMetricsApi = {
  path: '/api/v2/metrics/';
  method: 'POST';
  body: {

    /**
     * The list of metrics to retrieve
     */
    metrics: MetricToFetch[];

    /**
     * Start of the time window to gather metrics in
     */
    startTime?: number;

    /**
     * End of the time window to gather metrics in
     */
    endTime?: number;

    /**
     * The amount of time for each data point, in seconds
     */
    period?: number;

    /**
     * Amount of time to cover in the response, in seconds
     */
    timerange?: number;

    /**
     * Pass 'y' to retrieve the most recent data, even if it is not fully settled
     */
    live?: 'y' | 'n';
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      startTime: number;
      endTime: number;
      period: number;
      labels: {
        [key: string]: string;
      };
      data: {
        ts: string;
        values: {
          [key: string]: number;
        };
      }[];
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

export const getMetricsApiBodyValidator: Validator<GetMetricsApi['body']> = {
  metrics: {
    required: true,
    types: {
      array: {},
    },
  },
  startTime: {
    required: false,
    types: {
      number: {},
    },
  },
  endTime: {
    required: false,
    types: {
      number: {},
    },
  },
  period: {
    required: false,
    types: {
      number: {},
    },
  },
  timerange: {
    required: false,
    types: {
      number: {},
    },
  },
  live: {
    required: false,
    types: {
      string: {
        exact: [
          'y',
          'n',
        ],
      },
    },
  },
};

export const timingMetricValidator: Validator<TimingMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'timing', ],
      },
    },
  },
  label: {
    required: true,
    types: { string: {}, },
  },
  namespace: {
    required: true,
    types: {
      string: {
        exact: [
          'DTR Metrics',
          'Twilio Health',
        ],
      },
    },
  },
  metricName: {
    required: true,
    types: {
      string: {
        exact: [
          'Decode Rate',
          'DeliveredTime',
          'PageDuration',
          'PageToQueue',
          'SentTime',
          'UploadTime',
        ],
      },
    },
  },
  tower: {
    required: false,
    types: {
      string: {
        exact: [
          'PoolTable',
          'Saguache',
          'SanAntonio',
        ],
      },
    },
  },
  stat: {
    required: true,
    types: {
      string: {
        exact: [
          'Minimum',
          'Maximum',
          'SampleCount',
          'p50',
          'p80',
        ],
      },
    },
  },
};

export const countMetricValidator: Validator<CountMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'count', ],
      },
    },
  },
  label: {
    required: true,
    types: { string: {}, },
  },
  namespace: {
    required: true,
    types: {
      string: {
        exact: [
          'CVFD API',
          'Twilio Health',
          'VHF Metrics',
        ],
      },
    },
  },
  metricName: {
    required: true,
    types: {
      string: {
        exact: [
          '120-home',
          'Call',
          'Initiated',
          'cvfd-station',
        ],
      },
    },
  },
  source: {
    required: false,
    types: {
      string: {
        exact: [ 'S3', ],
      },
    },
  },
  action: {
    required: false,
    types: {
      string: {
        exact: [
          'createDTR',
          'createVHF',
        ],
      },
    },
  },
};

export const lambdaMetricValidator: Validator<LambdaMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'lambda', ],
      },
    },
  },
  fn: {
    required: true,
    types: { string: {}, },
  },
  metric: {
    required: true,
    types: {
      string: {
        exact: [
          'Duration',
          'Errors',
          'Invocations',
        ],
      },
    },
  },
  stat: {
    required: true,
    types: {
      string: {
        exact: [
          'p50',
          'Maximum',
          'Minimum',
          'Sum',
        ],
      },
    },
  },
};
