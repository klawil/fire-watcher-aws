import {
  FirehoseClient, PutRecordBatchCommand
} from '@aws-sdk/client-firehose';
import {
  describe, expect, it, vi
} from 'vitest';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/eventsV3';

describe('resources/api/v2/eventsV3', () => {
  it('Uses the event timestamp to create the datetime partition without storing a timestamp column', async () => {
    const firehoseSpy = vi.spyOn(FirehoseClient.prototype, 'send').mockResolvedValue({} as never);

    const req = generateApiEvent({
      method: 'POST',
      path: '',
      queryStringParameters: {
        code: process.env.API_CODE,
      },
      body: JSON.stringify([ {
        event: 'GRANT',
        timestamp: Date.UTC(2025, 0, 1, 12),
        system: 'Saguache',
        source: 1234,
        priority: 5,
        opcode: 3,
        freq: 1234567,
        encrypted: false,
        emergency: false,
      }, ]),
    });

    const res = await main(req);
    expect(res.statusCode).toBe(200);
    const command = firehoseSpy.mock.calls[0][0] as PutRecordBatchCommand;
    const data = command.input.Records?.[0].Data;
    const recordData = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const record = JSON.parse(recordData);
    expect(record.datePartition).toBe('2025-01-01-12');
    expect(record).not.toHaveProperty('timestamp');
  });
});
