import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/text';
import { typedUpdate } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/text', () => {
  it('Returns 400 for invalid payload', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      body: JSON.stringify({
        phone: 'bad',
      }),
      pathParameters: {
        id: 'bad',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 200 when seen marker update succeeds', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '1735689600000',
      },
      body: JSON.stringify({
        phone: 5555550000,
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
