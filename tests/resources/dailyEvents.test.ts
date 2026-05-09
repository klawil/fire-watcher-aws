import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { main } from '@/resources/dailyEvents';
import {
  typedQuery, typedScan, typedUpdate
} from '@/utils/backend/dynamoTyped';

const { athenaSendMock } = vi.hoisted(() => ({
  athenaSendMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: vi.fn(() => ({
    send: athenaSendMock,
  })),
  StartQueryExecutionCommand: vi.fn(v => ({
    type: 'startQueryExecution',
    ...v,
  })),
  GetQueryExecutionCommand: vi.fn(v => ({
    type: 'getQueryExecution',
    ...v,
  })),
  GetQueryResultsCommand: vi.fn(v => ({
    type: 'getQueryResults',
    ...v,
  })),
}));

describe('resources/dailyEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => unknown) => {
      cb();
      return 0 as never;
    }) as never);
  });

  it('Exits early when radios are missing', async () => {
    (vi.mocked(typedScan) as any).mockResolvedValueOnce({});

    await expect(main()).resolves.toBeUndefined();
  });

  it('Exits early when talkgroups are missing', async () => {
    (vi.mocked(typedScan) as any)
      .mockResolvedValueOnce({
        Items: [ { RadioID: '101' } ],
      })
      .mockResolvedValueOnce({});

    await expect(main()).resolves.toBeUndefined();
  });

  it('Processes device and talkgroup event/recording updates', async () => {
    (vi.mocked(typedScan) as any)
      .mockResolvedValueOnce({
        Items: [
          {
            RadioID: '101',
            InUse: 'Y',
            Count: 0,
            EventsCount: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        Items: [
          {
            ID: 8198,
            InUse: 'Y',
            Count: 0,
            EventsCount: 0,
          },
        ],
      });

    (vi.mocked(typedQuery) as any)
      .mockResolvedValueOnce({
        Items: [
          {
            RadioID: '101',
            StartTime: 1735689601,
          },
        ],
      })
      .mockResolvedValueOnce({
        Items: [
          {
            Talkgroup: 8198,
            StartTime: 1735689601,
            Added: 1735689601,
          },
        ],
      });

    athenaSendMock.mockImplementation(async (command: { type: string; QueryExecutionId?: string; QueryString?: string }) => {
      if (command.type === 'startQueryExecution') {
        return {
          QueryExecutionId: command.QueryString?.includes('radioid')
            ? 'q-radio'
            : 'q-tg',
        };
      }
      if (command.type === 'getQueryExecution') {
        return {
          QueryExecution: {
            Status: {
              State: 'SUCCEEDED',
            },
          },
        };
      }
      if (command.type === 'getQueryResults' && command.QueryExecutionId === 'q-radio') {
        return {
          ResultSet: {
            Rows: [
              { Data: [ { VarCharValue: 'radioid' }, { VarCharValue: 'num' } ] },
              { Data: [ { VarCharValue: '101' }, { VarCharValue: '5' } ] },
            ],
          },
        };
      }

      return {
        ResultSet: {
          Rows: [
            { Data: [ { VarCharValue: 'talkgroup' }, { VarCharValue: 'num' } ] },
            { Data: [ { VarCharValue: '8198' }, { VarCharValue: '7' } ] },
          ],
        },
      };
    });

    await expect(main()).resolves.toBeUndefined();
    expect(typedUpdate).toHaveBeenCalled();
  });
});
