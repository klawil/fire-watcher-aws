import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/textlink';
import { typedUpdate } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/textlink', () => {
  it('Returns 400 for invalid query', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns redirect and marks message opened', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: {
        f: '8332-123',
        tg: '8198',
        t: '1',
        p: '5555551111',
        m: '1735689600000',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(302);
    expect(res.multiValueHeaders?.Location?.[0]).toContain('/?f=');
  });
});
