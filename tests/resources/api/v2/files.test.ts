import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/files';
import { mergeDynamoQueriesDocClient } from '@/resources/api/v2/_utils';

describe('resources/api/v2/files', () => {
  it('Returns 200 for default query', async () => {
    const req = generateApiEvent({ method: 'GET', path: '' });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 400 for invalid query input', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        before: [ 'nope' ],
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Builds talkgroup query with after filter', async () => {
    vi.mocked(mergeDynamoQueriesDocClient).mockResolvedValue({
      MinSortKey: 10,
      MaxSortKey: 20,
      MaxAfterKey: 30,
      Items: [
        {
          Talkgroup: 8198,
          StartTime: 20,
          Added: 30,
        },
      ],
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        tg: [ '8198' ],
        after: [ '10' ],
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(mergeDynamoQueriesDocClient).mock.calls[0][0].ScanIndexForward).toBe(true);
  });

  it('Uses device table for radioId query and supports afterAdded', async () => {
    vi.mocked(mergeDynamoQueriesDocClient).mockResolvedValue({
      MinSortKey: null,
      MaxSortKey: null,
      MaxAfterKey: null,
      Items: [],
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
      multiValueQueryStringParameters: {
        radioId: [ '1001' ],
        afterAdded: [ '20' ],
      },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"files":[]');
  });
});
