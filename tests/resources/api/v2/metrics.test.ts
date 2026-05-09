import {
  CloudWatchClientMock
} from '../../../../__mocks__/@aws-sdk/client-cloudwatch';
import {
  describe, expect, it
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/metrics';

describe('resources/api/v2/metrics', () => {
  it('Returns 401 for missing user', async () => {
    const req = generateApiEvent({ method: 'POST', path: '' });
    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 for non-admin user', async () => {
    const req = generateApiEvent({ method: 'POST', path: '' });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns 400 for malformed body', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({ metrics: 'bad' }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 400 when metrics payload fails validation', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        period: 3600,
        startTime: 1735689600000,
        endTime: 1735776000000,
        metrics: [
          {
            type: 'count',
            namespace: 'DTR Metrics',
            metricName: 'Decode Rate',
            label: 'Decode Rate',
          },
        ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 400 when metrics list is empty', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        metrics: [],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('metrics');
  });

  it('Returns 400 when lambda metric fn is unknown', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        metrics: [
          {
            type: 'lambda',
            fn: 'missing_fn',
            metric: 'Invocations',
            stat: 'Sum',
          },
        ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('0-fn');
  });

  it('Returns 200 with empty labels/data for special lambda group with no configured functions', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        metrics: [
          {
            type: 'lambda',
            fn: 'all',
            metric: 'Invocations',
            stat: 'Sum',
          },
        ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"labels":{}');
    expect(res.body).toContain('"data":[]');
  });

  it('Returns metric data for valid count and timing metrics', async () => {
    CloudWatchClientMock.setResult('getMetricData', {
      MetricDataResults: [
        {
          Id: 'count_CVFD_API_Call',
          Label: 'API Calls',
          Timestamps: [ new Date('2026-01-01T00:00:00.000Z') ],
          Values: [ 4 ],
        },
        {
          Id: 'timing_Twilio_Health_PageDuration_p50',
          Label: 'Page Duration',
          Timestamps: [ new Date('2026-01-01T00:00:00.000Z') ],
          Values: [ 2500 ],
        },
      ],
    });

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        metrics: [
          {
            type: 'count',
            namespace: 'CVFD API',
            metricName: 'Call',
            label: 'API Calls',
          },
          {
            type: 'timing',
            namespace: 'Twilio Health',
            metricName: 'PageDuration',
            label: 'Page Duration',
            stat: 'p50',
          },
        ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"labels"');
    expect(res.body).toContain('"data"');
  });
});
