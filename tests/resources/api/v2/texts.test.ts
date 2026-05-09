import {
  describe, expect, it, vi
} from 'vitest';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://signed.example.com/textMedia/file-1'),
}));


import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/texts';
import { typedQuery } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/texts', () => {
  it('Returns 401 without user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { type: 'page' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 400 when both type and department are missing', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 403 for non-admins', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { type: 'page' },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns text list and replaces signed media urls', async () => {
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [
        {
          datetime: 1,
          type: 'page',
          recipients: 1,
          body: 'msg',
          mediaUrls: [ 'textMedia/file-1', 'https://example.com/file-2' ],
        },
      ],
      ScannedCount: 1,
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { type: 'page' },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"texts"');
    expect(res.body).toContain('https://signed.example.com/textMedia/file-1');
    expect(res.body).toContain('https://example.com/file-2');
  });

  it('Filters account texts and zero-recipient texts when all is not set', async () => {
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [
        {
          datetime: 1,
          type: 'account',
          recipients: 1,
        },
        {
          datetime: 2,
          type: 'department',
          department: 'Baca',
          recipients: 0,
        },
        {
          datetime: 3,
          type: 'department',
          department: 'Baca',
          recipients: 1,
        },
      ],
      ScannedCount: 3,
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { department: 'Baca' },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":1');
    expect(res.body).toContain('"datetime":3');
  });

  it('Includes zero-recipient texts when all=y', async () => {
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [
        {
          datetime: 2,
          type: 'department',
          department: 'Baca',
          recipients: 0,
        },
      ],
      ScannedCount: 1,
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: {
        department: 'Baca',
        all: 'y',
      },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":1');
    expect(res.body).toContain('"datetime":2');
  });
});
