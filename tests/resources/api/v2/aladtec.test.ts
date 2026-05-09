import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/aladtec';
import * as shiftDataMod from '@/utils/backend/shiftData';

describe('resources/api/v2/aladtec', () => {
  it('Returns 401 when user is missing', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });

    const res = await main(req);

    expect(res).toEqual({
      statusCode: 401,
      body: JSON.stringify({
        message: 'Missing Authentication Token',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      multiValueHeaders: {},
    });
  });

  it('Returns 403 for non-district admins', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);

    expect(res.statusCode).toBe(403);
  });

  it('Returns shift people for district admins', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, true, true);
    vi.spyOn(shiftDataMod, 'getShiftData').mockResolvedValue({
      people: {
        '1': 'User A',
      },
      shifts: [],
    });

    const res = await main(req);

    expect(res).toEqual({
      statusCode: 200,
      body: JSON.stringify({
        '1': 'User A',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      multiValueHeaders: {},
    });
  });
});
