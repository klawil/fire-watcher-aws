import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { S3Mock } from '../../__mocks__/@aws-sdk/client-s3';

import { main } from '@/resources/emailHandler';

const {
  parseMock,
  sesSendMock,
} = vi.hoisted(() => ({
  parseMock: vi.fn(),
  sesSendMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('postal-mime', () => ({
  default: {
    parse: parseMock,
  },
}));

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(() => ({
    send: sesSendMock,
  })),
  SendEmailCommand: vi.fn(v => v),
}));

describe('resources/emailHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Forwards parsed HTML/text email content', async () => {
    parseMock.mockResolvedValue({
      from: { address: 'sender@example.com' },
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
      attachments: [],
    });
    S3Mock.setResult('get', {
      Body: {
        transformToString: async () => 'From: test@example.com\n\nhello',
      },
    });

    await expect(main({
      Records: [
        {
          ses: {
            mail: {
              messageId: 'msg-1',
            },
          },
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(sesSendMock).toHaveBeenCalledTimes(1);
  });

  it('Forwards attachments as raw content', async () => {
    parseMock.mockResolvedValue({
      from: { address: 'sender@example.com' },
      subject: 'With Attachment',
      html: undefined,
      text: 'Attachment body',
      attachments: [
        {
          filename: 'hello.txt',
          mimeType: 'text/plain',
          disposition: 'attachment',
          contentId: 'cid1',
          content: 'hello',
          encoding: 'utf8',
        },
      ],
    });
    S3Mock.setResult('get', {
      Body: {
        transformToString: async () => 'raw-message',
      },
    });

    await expect(main({
      Records: [
        {
          ses: {
            mail: {
              messageId: 'msg-2',
            },
          },
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(sesSendMock).toHaveBeenCalledTimes(1);
  });

  it('Throws when S3 object body is missing', async () => {
    S3Mock.setResult('get', {});

    await expect(main({
      Records: [
        {
          ses: {
            mail: {
              messageId: 'msg-3',
            },
          },
        },
      ],
    } as never)).rejects.toThrow('Email body is undefined');
  });
});
