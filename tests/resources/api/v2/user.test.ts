import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/user';
import {
  typedDeleteItem,
  typedGet,
  typedUpdate
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/user', () => {
  it('Returns 401 on GET without user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '5555555555' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns frontend user object for current user GET', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: 'current' },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('5555555555');
  });

  it('Returns 403 for non-admin GET of another user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '5555550001' },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns 404 for missing user on admin GET', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '5555550001' },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(404);
  });

  it('Returns 400 when PATCH transcript settings conflict', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: 'current' },
      body: JSON.stringify({
        getTranscript: true,
        getTranscriptOnly: false,
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 401 on PATCH without user', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: 'current' },
      body: JSON.stringify({
        fName: 'New',
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 on PATCH for non-admin editing another user', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: '5555550001' },
      body: JSON.stringify({
        fName: 'New',
      }),
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Updates user when PATCH is valid', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555555555,
        fName: 'Old',
        lName: 'Name',
        departments: [ { id: 'Baca', active: true } ],
      },
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        phone: 5555555555,
        fName: 'New',
        lName: 'Name',
      },
    });
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: { id: '5555555555' },
      body: JSON.stringify({
        fName: 'New',
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Deletes user when authorized', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555550001,
        departments: [
          { id: 'Baca', active: true },
        ],
      },
    });
    (vi.mocked(typedDeleteItem) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555550001',
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 401 on DELETE without user', async () => {
    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555550001',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 on DELETE for non-admin', async () => {
    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555550001',
      },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });
});
