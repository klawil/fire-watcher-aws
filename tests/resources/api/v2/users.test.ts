import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent,
  mockUserRequest,
  testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/users';
import {
  typedPutItem,
  typedScan
} from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/users', () => {
  testUserAuth({
    method: 'GET',
    path: '',
  }, main, true);

  it('Returns user list for admins', async () => {
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [ {
        phone: 5555550001,
        fName: 'A',
        lName: 'B',
        departments: [ {
          id: 'Baca',
          active: true,
        }, ],
      }, ],
    });

    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });

  it('Returns 400 for invalid POST body', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({}),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  testUserAuth({
    method: 'POST',
    path: '',
    body: JSON.stringify({
      phone: 5555550001,
      fName: 'A',
      lName: 'B',
      department: 'Baca',
      admin: false,
      callSign: 'B-1',
      talkgroups: [ 8198, ],
      getTranscript: false,
      getTranscriptOnly: true,
    }),
  }, main, true);

  it('Creates user and queues activation', async () => {
    (vi.mocked(typedPutItem) as any).mockResolvedValue({});

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        phone: 5555550001,
        fName: 'A',
        lName: 'B',
        department: 'Baca',
        admin: false,
        callSign: 'B-1',
        talkgroups: [ 8198, ],
        getTranscript: true,
        getTranscriptOnly: true,
      }),
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
