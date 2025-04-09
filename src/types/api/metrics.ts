import { Validator } from "@/types/backend/validation";
import { api400Body, api401Body, api403Body, api500Body } from "./_shared";

export interface LambdaMetric {
  type: 'lambda';
  fn: string | 'all';
  metric: 'Invocations' | 'Errors' | 'Duration';
  stat: 'p50' | 'Maximum' | 'Minimum' | 'Sum';
}
export interface EventMetric {
  type: 'event';
  label: string;
  namespace: 'CVFD API' | 'VHF Metrics' | 'Twilio Health';
  metricName: 'Call' | '120-home' | 'cvfd-station' | 'Initiated' | 'SentTime' | 'DeliveredTime' | 'PageDuration';
  source?: 'S3';
  action?: 'createDTR' | 'createVHF';
  stat?: 'Sum' | 'SampleCount' | 'p80';
}
export interface TowerMetric {
  type: 'tower';
  label: string;
  tower: 'Saguache' | 'PoolTable' | 'SanAntonio';
  metric: 'UploadTime' | 'Decode Rate';
  stat: 'Minimum' | 'Maximum' | 'SampleCount' | 'p50';
}
export type MetricToFetch = LambdaMetric | EventMetric | TowerMetric;

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
}

export const getMetricsApiBodyValidator: Validator<GetMetricsApi['body']> = {
  metrics: {
    required: true,
    types: {
      array: {}
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
        exact: [ 'y', 'n' ],
      },
    },
  },
};

export const lambdaMetricValidator: Validator<LambdaMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'lambda' ],
      },
    },
  },
  fn: {
    required: true,
    types: { string: {} },
  },
  metric: {
    required: true,
    types: {
      string: {
        exact: [ 'Duration', 'Errors', 'Invocations', ],
      },
    },
  },
  stat: {
    required: true,
    types: {
      string: {
        exact: [ 'p50', 'Maximum', 'Minimum', 'Sum', ],
      },
    },
  },
}

export const eventMetricValidator: Validator<EventMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'event' ],
      },
    },
  },
  label: {
    required: true,
    types: {
      string: {},
    },
  },
  namespace: {
    required: true,
    types: {
      string: {
        exact: [ 'CVFD API', 'VHF Metrics', 'Twilio Health', ],
      },
    },
  },
  metricName: {
    required: true,
    types: {
      string: {
        exact: [ '120-home', 'Call', 'cvfd-station', 'Initiated', 'DeliveredTime', 'SentTime', 'PageDuration', ],
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
        exact: [ 'createDTR', 'createVHF', ],
      },
    },
  },
  stat: {
    required: false,
    types: {
      string: {
        exact: [ 'SampleCount', 'Sum', 'p80', ],
      },
    },
  },
}

export const towerMetricValidator: Validator<TowerMetric> = {
  type: {
    required: true,
    types: {
      string: {
        exact: [ 'tower' ],
      },
    },
  },
  label: {
    required: true,
    types: {
      string: {},
    },
  },
  tower: {
    required: true,
    types: { string: {
      exact: [ 'PoolTable', 'Saguache', 'SanAntonio', ],
    } },
  },
  metric: {
    required: true,
    types: {
      string: {
        exact: [ 'UploadTime', 'Decode Rate', ],
      },
    },
  },
  stat: {
    required: true,
    types: {
      string: {
        exact: [ 'p50', 'Maximum', 'Minimum', 'SampleCount', ],
      },
    },
  },
}
