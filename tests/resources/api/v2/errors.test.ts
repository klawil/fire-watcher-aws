import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/errors';
import {
  typedPutItem,
  typedScan
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/errors', () => {
  it('Returns 401 for GET with no user', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 for GET when not district admin', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns 200 with errors list for district admin GET', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, true);
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [
        {
          Datetime: 1,
          Url: '/x',
          Message: 'msg',
          Trace: 'trace',
          UserAgent: 'ua',
          User: 'u',
        },
      ],
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"errors"');
  });

  it('Returns 400 when POST payload is malformed', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        url: '/test',
      }),
    });

    const res = await main(req);

    expect(res.statusCode).toBe(400);
    expect(typedPutItem).toHaveBeenCalledTimes(0);
  });

  it('Stores incoming error payload and returns 500', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      headers: {
        'user-agent': 'vitest',
      },
      body: JSON.stringify({
        url: '/test',
        message: 'boom',
        trace: 'stack',
      }),
    });

    const res = await main(req);

    expect(res.statusCode).toBe(500);
    expect(typedPutItem).toHaveBeenCalledTimes(1);
  });
});
