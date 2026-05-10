import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/restart';
import * as alarmStatusMod from '@/utils/backend/alarmStatus';
import { sendAlertMessage } from '@/utils/backend/texts';

describe('resources/api/v2/restart', () => {
  it('Returns 400 for invalid tower param', async () => {
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { tower: 'bad', },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(400);
  });

  it('Returns 204 when restart is not needed', async () => {
    vi.spyOn(alarmStatusMod, 'getCachedAlarmData').mockResolvedValue({});
    const req = generateApiEvent({
      method: 'GET',
      path: '',
      pathParameters: { tower: 'PoolTable', },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('0');
  });

  it('Sends alert after restart acknowledgement', async () => {
    vi.mocked(sendAlertMessage).mockResolvedValue();
    const req = generateApiEvent({
      method: 'POST',
      path: '',
      pathParameters: { tower: 'PoolTable', },
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    expect(sendAlertMessage).toHaveBeenCalledTimes(1);
  });
});
