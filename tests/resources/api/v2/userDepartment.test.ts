import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest, testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/userDepartment';
import {
  typedGet,
  typedUpdate
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/userDepartment', () => {
  it('Returns 400 for invalid params', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({ active: true }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  testUserAuth({
    method: 'POST',
    path: '',
    pathParameters: {
      id: '5555551111',
      department: 'Baca',
    },
    body: JSON.stringify({ active: true }),
  }, main, true);

  it('Returns 404 when user not found on POST', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
      body: JSON.stringify({
        active: true,
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(404);
  });

  it('Updates user department and queues activation', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Baca', active: false },
        ],
      },
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Baca', active: true },
        ],
      },
    });

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
      body: JSON.stringify({
        active: true,
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 403 for POST when admin lacks target department scope', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
      body: JSON.stringify({
        active: true,
      }),
    });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  testUserAuth({
    method: 'PATCH',
    path: '',
    pathParameters: {
      id: '5555551111',
      department: 'Baca',
    },
    body: JSON.stringify({ active: true }),
  }, main, true);

  it('Updates user department via PATCH', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Baca', active: true },
        ],
      },
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Baca', active: false },
        ],
      },
    });

    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
      body: JSON.stringify({
        active: false,
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 403 for PATCH when admin lacks target department scope', async () => {
    const req = generateApiEvent({
      method: 'PATCH',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
      body: JSON.stringify({
        active: false,
      }),
    });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  testUserAuth({
    method: 'DELETE',
    path: '',
    pathParameters: {
      id: '5555551111',
      department: 'Baca',
    },
  }, main, true);

  it('Deletes department mapping', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Baca', active: true },
          { id: 'Other', active: true },
        ],
      },
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Other', active: true },
        ],
      },
    });

    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns existing user when DELETE target department is missing', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [
          { id: 'Other', active: true },
        ],
      },
    });

    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(typedUpdate)).not.toHaveBeenCalled();
  });

  it('Returns 403 for DELETE when admin lacks target department scope', async () => {
    const req = generateApiEvent({
      method: 'DELETE',
      path: '',
      pathParameters: {
        id: '5555551111',
        department: 'Baca',
      },
    });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });
});
