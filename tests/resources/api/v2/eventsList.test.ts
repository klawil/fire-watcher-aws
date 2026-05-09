import {
  AthenaClient
} from '@aws-sdk/client-athena';
import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/eventsList';
import { typedQuery } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/eventsList', () => {
  it('Returns 404 for unsupported type', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'bad',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(404);
  });

  it('Returns 400 for invalid params', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Starts query and returns query id', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValueOnce({ QueryExecutionId: 'q1' } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
        id: '8198',
      },
      queryStringParameters: {
        endTime: Date.now().toString(),
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('queryId');
  });

  it('Returns 500 when athena query id is missing', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValueOnce({} as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
        id: '8198',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(500);
  });

  it('Returns 500 when query state is CANCELLED', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValueOnce({
      QueryExecution: {
        Status: {
          State: 'CANCELLED',
        },
      },
    } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
        id: '8198',
      },
      queryStringParameters: {
        queryId: 'q1',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(500);
  });

  it('Returns in-progress status for queued query', async () => {
    vi.spyOn(AthenaClient.prototype, 'send').mockResolvedValueOnce({
      QueryExecution: {
        Status: {
          State: 'QUEUED',
        },
      },
    } as never);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
        id: '8198',
      },
      queryStringParameters: {
        queryId: 'q1',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('QUEUED');
  });

  it('Returns merged events when query is complete', async () => {
    vi.spyOn(AthenaClient.prototype, 'send')
      .mockResolvedValueOnce({ QueryExecution: { Status: { State: 'SUCCEEDED' } } } as never)
      .mockResolvedValueOnce({
        ResultSet: {
          Rows: [
            { Data: [ { VarCharValue: 'event' }, { VarCharValue: 'timestamp' } ] },
            { Data: [ { VarCharValue: 'tone' }, { VarCharValue: '1735689700000' } ] },
          ],
        },
      } as never);
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [
        {
          StartTime: 1735689700,
          Added: 1735689701,
          Talkgroup: 8198,
          Key: 'audio/file.m4a',
        },
      ],
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        type: 'talkgroup',
        id: '8198',
      },
      queryStringParameters: {
        queryId: 'q1',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('events');
  });
});
