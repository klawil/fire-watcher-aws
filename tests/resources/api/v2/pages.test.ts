import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/pages';
import { typedQuery } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/pages', () => {
  it('Returns 401 for missing user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 401 for inactive user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, false, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Allows empty query and returns 200', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns paged files with before cursor', async () => {
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [ {
        Key: 'audio/test.m4a',
        Talkgroup: 8198,
        StartTime: 100,
        Added: 101,
      }, ],
    });
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        tg: [ '8198', ],
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"before"');
  });
});
