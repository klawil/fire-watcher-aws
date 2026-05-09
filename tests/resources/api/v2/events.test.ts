import {
  describe, expect, it, vi
} from 'vitest';

import {
  AthenaClient
} from '@aws-sdk/client-athena';
import {
  FirehoseClient
} from '@aws-sdk/client-firehose';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/events';

describe('resources/api/v2/events', () => {
  it('Returns 401 when user is missing on GET', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 401 when user is inactive on GET', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, false, false, false);
    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 400 for malformed GET query', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Starts an Athena query when groupBy is provided', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValue({
      QueryExecutionId: 'q1',
    } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        groupBy: [ 'event' ],
      },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('queryId');
  });

  it('Returns 500 when query execution state is FAILED', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValue({
      QueryExecution: {
        Status: {
          State: 'FAILED',
        },
      },
    } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        queryId: [ 'q1', ],
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(500);
  });

  it('Returns status while query execution is RUNNING', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValue({
      QueryExecution: {
        Status: {
          State: 'RUNNING',
        },
      },
    } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        queryId: [ 'q1', ],
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('RUNNING');
  });

  it('Parses paginated Athena query rows', async () => {
    vi.spyOn(AthenaClient.prototype, 'send')
      .mockResolvedValueOnce({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      } as never)
      .mockResolvedValueOnce({
        ResultSet: {
          Rows: [
            { Data: [ { VarCharValue: 'event', }, { VarCharValue: 'num', }, ], },
            { Data: [ { VarCharValue: 'call', }, { VarCharValue: '1', }, ], },
          ],
        },
        NextToken: 'next-token',
      } as never)
      .mockResolvedValueOnce({
        ResultSet: {
          Rows: [
            { Data: [ { VarCharValue: 'event', }, { VarCharValue: 'num', }, ], },
            { Data: [ { VarCharValue: 'join', }, { VarCharValue: '2', }, ], },
          ],
        },
      } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        queryId: [ 'q1', ],
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":2');
    expect(res.body).toContain('"event":"call"');
    expect(res.body).toContain('"event":"join"');
  });

  it('Returns 400 for invalid POST body', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({ not: 'an-array' }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 400 when POST items fail validation', async () => {
    vi.spyOn(FirehoseClient.prototype, 'send').mockResolvedValue({} as never);

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify([
        {
          event: 'call',
          talkgroup: '1234',
          timestamp: Date.now(),
        },
      ]),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Sends valid POST items to firehose and still returns 400 when some items are invalid', async () => {
    const firehoseSpy = vi.spyOn(FirehoseClient.prototype, 'send').mockResolvedValue({} as never);

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      queryStringParameters: {
        code: process.env.API_CODE,
      },
      body: JSON.stringify([
        {
          tower: 'Saguache',
          radioId: '1234',
          event: 'call',
          talkgroup: '8198',
          talkgroupList: '8198',
          timestamp: 1735689600000,
        },
        {
          tower: 'Saguache',
          event: 'call',
        },
      ]),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
    expect(firehoseSpy).toHaveBeenCalledTimes(1);
    expect(res.body).toContain('1-');
  });
});
