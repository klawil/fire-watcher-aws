import {
  describe, expect, it
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/logout';

describe('resources/api/v2/logout', () => {
  it('Redirects to home when query is omitted', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });

    const res = await main(req);
    expect(res.statusCode).toBe(302);
  });

  it('Clears auth cookies and redirects', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      headers: {
        Cookie: 'cofrn-user=1;cofrn-token=t;other=x',
      },
      queryStringParameters: {
        redirectTo: '/login',
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(302);
    expect(res.multiValueHeaders?.Location).toEqual([ '/login', ]);
    expect((res.multiValueHeaders?.['Set-Cookie'] || []).length).toBeGreaterThanOrEqual(1);
  });
});
