import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/radio';
import { typedUpdate } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/radio', () => {
  it('Returns 401 without user', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '10',
      },
      body: JSON.stringify({
        name: 'new',
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 400 for malformed patch', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '10',
      },
      body: JSON.stringify({
        name: 123,
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 403 when user cannot edit names', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '10',
      },
      body: JSON.stringify({
        name: 'new',
      }),
    });
    mockUserRequest(req, true, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Updates radio name', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '10',
      },
      body: JSON.stringify({
        name: 'new-name',
      }),
    });
    mockUserRequest(req, true, true, false, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
