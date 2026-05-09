import {
  describe, expect, it, vi
} from 'vitest';

import { main } from '@/resources/status';
import {
  typedScan,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import { sendAlertMessage } from '@/utils/backend/texts';

describe('resources/status', () => {
  it('Sends alert and updates heartbeat failure state', async () => {
    vi.useFakeTimers().setSystemTime(600000);
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [
        {
          Server: 'primary-1',
          IsPrimary: true,
          IsFailed: false,
          LastHeartbeat: 0,
        },
        {
          Server: 'secondary-1',
          IsPrimary: false,
          IsFailed: false,
          LastHeartbeat: 600000,
        },
      ],
    });
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});
    vi.mocked(sendAlertMessage).mockResolvedValue();

    await main();

    expect(typedUpdate).toHaveBeenCalled();
    expect(sendAlertMessage).toHaveBeenCalledTimes(1);
  });
});
