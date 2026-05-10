import {
  describe, expect, it, vi
} from 'vitest';

import {
  generateApiEvent, mockUserRequest
} from './_utils';

import { main } from '@/resources/api/v2/sites';
import { typedQuery } from '@/utils/backend/dynamoTyped';

describe('resources/api/v2/sites', () => {
  it('Returns 401 on GET without user', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    const res = await main(req);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 403 on GET for non-admin', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, false, false);

    const res = await main(req);
    expect(res.statusCode).toBe(403);
  });

  it('Returns active sites for admins', async () => {
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [ {
        SiteId: '1-2',
        IsActive: 'y',
      }, ],
    });
    const req = generateApiEvent({
      method: 'GET',
      path: '',
    });
    mockUserRequest(req, true, true, true);

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"count":1');
  });

  it('Returns 400 for invalid adjacent payload shape', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        adjacent: [ [ {
          rfss: '1',
          site: '2',
          sys_shortname: 'TEST',
          time: '10',
          conv_ch: '1',
          site_failed: '0',
          valid_info: '1',
          composite_ctrl: '1',
          active_conn: '1',
          backup_ctrl: '0',
          no_service_req: '0',
          supports_data: '1',
          supports_voice: '1',
          supports_registration: '1',
          supports_authentication: '1',
        }, ], ],
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 400 for empty adjacent rows', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        adjacent: [ '', ],
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 200 for valid adjacent payload', async () => {
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      body: JSON.stringify({
        code: 'TEST_API_CODE',
        adjacent: [ [ {
          rfss: '1',
          site: '2',
          sys_shortname: 'TEST',
          time: '10',
          conv_ch: true,
          site_failed: false,
          valid_info: true,
          composite_ctrl: true,
          active_conn: true,
          backup_ctrl: false,
          no_service_req: false,
          supports_data: true,
          supports_voice: true,
          supports_registration: true,
          supports_authentication: true,
        }, ], ],
      }),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
  });
});
