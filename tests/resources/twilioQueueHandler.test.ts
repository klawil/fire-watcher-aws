import {
  describe, expect, it, vi
} from 'vitest';

import { main } from '@/resources/twilioQueueHandler';
import { typedUpdate } from '@/utils/backend/dynamoTyped';

describe('resources/twilioQueueHandler', () => {
  it('Groups statuses by message id and updates dynamo', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});

    await main({
      Records: [
        {
          body: JSON.stringify({
            datetime: 111,
            status: 'delivered',
            eventTime: 1000,
            phone: '+15555550001',
          }),
        },
        {
          body: JSON.stringify({
            datetime: 111,
            status: 'failed',
            eventTime: 1010,
            phone: '+15555550002',
          }),
        },
      ],
    } as never);

    expect(typedUpdate).toHaveBeenCalledTimes(1);
  });
});
