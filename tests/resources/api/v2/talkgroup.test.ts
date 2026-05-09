import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/talkgroup';
import {
  typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/talkgroup', () => {
  it('Returns 400 for invalid params', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 404 when talkgroup is missing', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({});
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '8198' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(404);
  });

  it('Returns 401 for PATCH with no user', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: '8198' },
      body: JSON.stringify({ name: 'Dispatch' }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 for PATCH when cannot edit names', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: '8198' },
      body: JSON.stringify({ name: 'Dispatch' }),
    });
    mockUserRequest(req, true, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Patches talkgroup name for editor', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        ID: 8198,
      },
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        ID: 8198,
        Name: 'Dispatch',
      },
    });
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: '8198' },
      body: JSON.stringify({ name: 'Dispatch' }),
    });
    mockUserRequest(req, true, false, false, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
