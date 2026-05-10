import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest, testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/department';
import {
  typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/department', () => {
  describe('GET', () => {
    testUserAuth({
      method: 'GET',
      path: '',
      pathParameters: { id: 'Baca', },
    }, main, true);

    it('Returns 403 when user lacks department access', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'Baca',
        },
      });
      mockUserRequest(req, true, true, false);
      (vi.mocked(typedGet) as any).mockResolvedValue({});

      const res = await main(req);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH', () => {
    testUserAuth({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: 'Baca',
      },
      body: JSON.stringify({
        name: 'Updated Name',
      }),
    }, main, true);

    it('Returns 400 for malformed request body', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'Baca',
        },
        body: JSON.stringify({
          name: 10,
        }),
      });
      mockUserRequest(req, true, true, true);

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Updates department fields', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'Baca',
        },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });
      mockUserRequest(req, true, true, true);
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          id: 'Baca',
          name: 'Old Name',
          pagingTalkgroups: [],
          type: 'page',
        },
      });
      (vi.mocked(typedUpdate) as any).mockResolvedValue({
        Attributes: {
          id: 'Baca',
          name: 'Updated Name',
          pagingTalkgroups: [],
          type: 'page',
        },
      });

      const res = await main(req);
      expect(res.statusCode).toBe(200);
      expect(typedUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
