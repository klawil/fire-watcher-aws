import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/invoiceItems';
import { getTwilioSecret } from '@/deprecated/utils/general';
import { typedGet } from '@/utils/backend/dynamoTyped';
import { getTwilioItems } from '@/utils/backend/twilio';

vi.mock('@/utils/backend/twilio', () => ({
  getTwilioItems: vi.fn(),
}));

describe('resources/api/v2/invoiceItems', () => {
  it('Returns 401 without user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 for non-admin user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns 404 when invoice is missing', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
      queryStringParameters: { month: 'last' },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(404);
  });

  it('Returns 403 for invoice with inaccessible department', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        id: '2026-JAN-BACA',
        department: 'UnknownDepartment',
      },
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
      queryStringParameters: { month: 'last' },
    });
    mockUserRequest(req, true, true, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns twilio invoice items for authorized user', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        id: '2026-JAN-BACA',
        department: 'Baca',
      },
    });
    (vi.mocked(getTwilioItems) as any).mockResolvedValue([
      {
        type: 'twilio',
        cat: 'Outbound SMS',
        usage: 10,
        usageUnit: 'messages',
        price: 1.2,
        start: '2026-01-01',
        end: '2026-01-31',
      },
    ]);

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
      queryStringParameters: { month: 'last' },
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"items"');
  });

  it('Throws when twilio secret is missing department credentials', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        id: '2026-JAN-BACA',
        department: 'Baca',
      },
    });
    (vi.mocked(getTwilioSecret) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
      queryStringParameters: { month: 'last' },
    });
    mockUserRequest(req, true, true, true);

    await expect(main(req)).rejects.toThrow('Unable to find auth for account Baca');
  });

  it('Throws when twilio usage retrieval fails', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        id: '2026-JAN-BACA',
        department: 'Baca',
      },
    });
    (vi.mocked(getTwilioItems) as any).mockRejectedValue(new Error('twilio timeout'));

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { id: '2026-JAN-BACA' },
      queryStringParameters: { month: 'last' },
    });
    mockUserRequest(req, true, true, true);

    await expect(main(req)).rejects.toThrow('twilio timeout');
  });
});
