import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/talkgroups';
import {
  typedFullQuery, typedFullScan
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/talkgroups', () => {
  it('Returns 200 for default query', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });
    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 400 when all=n is not accepted by validator', async () => {
    (vi.mocked(typedFullQuery) as any).mockResolvedValue({
      Items: [ { ID: 8198, Name: 'Dispatch' } ],
      LastEvaluatedKey: null,
      Runs: 1,
    });
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { all: 'n' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns all talkgroups when all=y', async () => {
    (vi.mocked(typedFullScan) as any).mockResolvedValue({
      Items: [ { ID: 1 }, { ID: 2 } ],
      LastEvaluatedKey: null,
      Runs: 1,
    });
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      queryStringParameters: { all: 'y' },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":2');
  });
});
