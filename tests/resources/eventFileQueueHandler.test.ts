import {
  describe, expect, it, vi
} from 'vitest';

vi.mock('@aws-sdk/client-glue', () => {
  const send = vi.fn(input => {
    if ('PartitionsToGet' in input) {
      return Promise.resolve({ Partitions: [] });
    }

    return Promise.resolve({});
  });

  return {
    GlueClient: vi.fn(() => ({ send })),
    BatchGetPartitionCommand: vi.fn(v => v),
    BatchCreatePartitionCommand: vi.fn(v => v),
  };
});

import { main } from '@/resources/eventFileQueueHandler';

describe('resources/eventFileQueueHandler', () => {
  it('Returns early when no records exist', async () => {
    await expect(main({ Records: [] } as never)).resolves.toBeUndefined();
  });

  it('Builds partition requests from S3 keys', async () => {
    await expect(main({
      Records: [
        {
          s3: {
            object: {
              key: 'datetime=2026-01-01-00/event=call/file.orc',
            },
          },
        },
      ],
    } as never)).resolves.toBeUndefined();
  });
});
