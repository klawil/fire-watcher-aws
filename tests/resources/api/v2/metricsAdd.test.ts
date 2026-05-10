import {
  describe, expect, it
} from 'vitest';

import {
  CloudWatchClientMock
} from '../../../../__mocks__/@aws-sdk/client-cloudwatch';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/metricsAdd';

describe('resources/api/v2/metricsAdd', () => {
  it('Returns 401 when auth query code is missing', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({ data: [], }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 400 when body data is empty', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      queryStringParameters: {
        code: process.env.API_CODE,
      },
      body: JSON.stringify({ data: [], }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Publishes cloudwatch metrics and returns 200', async () => {
    CloudWatchClientMock.setResult('putMetricData', {});
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      queryStringParameters: {
        code: process.env.API_CODE,
      },
      body: JSON.stringify({
        data: [ {
          id: 'saguache',
          val: 7,
        }, ],
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
