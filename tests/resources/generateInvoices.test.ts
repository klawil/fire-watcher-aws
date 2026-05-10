import {
  describe, expect, it, vi
} from 'vitest';

import { S3Mock } from '../../__mocks__/@aws-sdk/client-s3';

import { getTwilioSecret } from '@/deprecated/utils/general';
import { main } from '@/resources/generateInvoices';
import {
  typedPutItem, typedScan
} from '@/utils/backend/dynamoTyped';

vi.mock('pdfkit', () => {
  return {
    default: class MockPdf {
      private handlers: { [key: string]: ((...args: unknown[]) => void)[] } = {};

      on(event: string, cb: (...args: unknown[]) => void) {
        this.handlers[event] = this.handlers[event] || [];
        this.handlers[event].push(cb);
        return this;
      }

      fontSize() {
        return this;
      }

      text() {
        return this;
      }

      moveDown() {
        return this;
      }

      table() {
        return this;
      }

      end() {
        (this.handlers.data || []).forEach(cb => cb(Buffer.from('pdf')));
        (this.handlers.end || []).forEach(cb => cb());
      }
    },
  };
});

vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    api: {
      v2010: {
        account: {
          usage: {
            records: {
              list: vi.fn((_: unknown, cb: (err: unknown, items: Array<{
                category: string;
                price: string;
                usage: string;
                usageUnit: string;
                startDate: string;
                endDate: string
              }>) => void) => cb(null, [
                {
                  category: 'sms-outbound',
                  price: '1.25',
                  usage: '10',
                  usageUnit: 'messages',
                  startDate: '2026-01-01',
                  endDate: '2026-01-31',
                },
                {
                  category: 'totalprice',
                  price: '1.25',
                  usage: '0',
                  usageUnit: 'messages',
                  startDate: '2026-01-01',
                  endDate: '2026-01-31',
                },
              ])),
            },
          },
        },
      },
    },
  })),
}));

const { sesSendMock, } = vi.hoisted(() => ({
  sesSendMock: vi.fn().mockResolvedValue({}),
}));
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(() => ({
    send: sesSendMock,
  })),
  SendEmailCommand: vi.fn(v => v),
}));

describe('resources/generateInvoices', () => {
  it('Exits when there are no departments to invoice', async () => {
    (vi.mocked(typedScan) as any).mockResolvedValue({});

    await expect(main()).resolves.toBeUndefined();
  });

  it('Generates and stores invoices for monthly departments', async () => {
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [ {
        id: 'Baca',
        name: 'Baca Fire',
        invoiceFrequency: 'monthly',
        invoiceEmail: [ 'billing@example.com', ],
      }, ],
    });
    (vi.mocked(getTwilioSecret) as any).mockResolvedValue({
      accountSidBaca: 'sid',
      authTokenBaca: 'token',
    });

    S3Mock.setResult('get', {
      Body: {
        transformToByteArray: async () => Uint8Array.from([
          1,
          2,
          3,
        ]),
      },
    });

    await expect(main()).resolves.toBeUndefined();

    expect(typedPutItem).toHaveBeenCalledTimes(1);
    expect(sesSendMock).toHaveBeenCalledTimes(1);
  });
});
