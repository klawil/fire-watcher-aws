import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/file';
import { typedGet } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/file', () => {
  it('Returns 400 when id is missing', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 400 when id format is invalid', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        id: 'abc',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns file when found', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        Talkgroup: 8332,
        Added: 1745367697,
        Key: 'audio/test.m4a',
      },
    });
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: {
        id: '8332-1745367697',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('audio/test.m4a');
  });
});
