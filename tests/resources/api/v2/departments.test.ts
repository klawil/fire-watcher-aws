import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest, testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/departments';
import {
  typedGet, typedPutItem, typedScan
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/departments', () => {
  testUserAuth({ method: 'GET', path: '' }, main, true);

  it('Returns 403 for GET when admin has no department scope', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns sorted departments for admin', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, true);
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [
        { id: 'b', name: 'B', pagingTalkgroups: [], type: 'page' },
        { id: 'a', name: 'A', pagingTalkgroups: [], type: 'page' },
      ],
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"id":"a"');
  });

  testUserAuth({
    method: 'POST',
    path: '',
    body: JSON.stringify({
      id: 'test',
      name: 'Test',
      pagingTalkgroups: [ 8198 ],
      type: 'page',
      invoiceFrequency: 'monthly',
      invoiceEmail: [ 'billing@example.com' ],
    }),
  }, main, true);

  it('Returns 403 for POST when user is not district admin', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        id: 'test',
        name: 'Test',
        pagingTalkgroups: [ 8198 ],
        type: 'page',
        invoiceFrequency: 'monthly',
        invoiceEmail: [ 'billing@example.com' ],
      }),
    });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns 400 when create payload is incomplete', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        id: 'test',
        name: 'Test',
        pagingTalkgroups: [],
        type: 'page',
      }),
    });
    mockUserRequest(req, true, true, true);
    const res = await main(req);
    expect(res.statusCode).toBe(400);
    expect(typedGet).toHaveBeenCalledTimes(0);
    expect(typedPutItem).toHaveBeenCalledTimes(0);
  });

  it('Returns 400 when department id already exists', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        id: 'test',
        name: 'Existing',
        type: 'page',
      },
    });

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        id: 'test',
        name: 'Test',
        pagingTalkgroups: [ 8198 ],
        type: 'page',
        invoiceFrequency: 'monthly',
        invoiceEmail: [ 'billing@example.com' ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
    expect(typedPutItem).toHaveBeenCalledTimes(0);
  });

  it('Creates department for district admin', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        id: 'test',
        name: 'Test',
        pagingTalkgroups: [ 8198 ],
        type: 'page',
        invoiceFrequency: 'monthly',
        invoiceEmail: [ 'billing@example.com' ],
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(typedPutItem).toHaveBeenCalledTimes(1);
  });
});
