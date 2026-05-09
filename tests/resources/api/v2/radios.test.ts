import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/radios';
import { typedFullScan } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/radios', () => {
  it('Returns 401 for missing user', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns radios list for authenticated users', async () => {
    (vi.mocked(typedFullScan) as any).mockResolvedValue({
      Items: [
        {
          RadioID: '101',
          Name: 'alpha',
          Count: 1,
          EventsCount: 1,
        },
      ],
      LastEvaluatedKey: null,
      Runs: 1,
    });

    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":1');
  });
});
