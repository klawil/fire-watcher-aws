import {
  describe, expect, it, vi
} from 'vitest';

import { main } from '@/resources/queue';
import {
  typedGet,
  typedQuery,
  typedScan,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import {
  getPageNumber,
  getUserRecipients,
  saveMessageData,
  sendMessage
} from '@/utils/backend/texts';

vi.mock('@/deprecated/utils/general', () => ({
  getTwilioSecret: vi.fn(async () => ({
    accountSid: 'sid',
    authToken: 'token',
  })),
  twilioPhoneCategories: vi.fn(async () => ({
    pageBaca: {
      number: '+15550000000',
    },
  })),
  twilioPhoneNumbers: vi.fn(async () => ({
    '+15550000000': {
      department: 'Baca',
      type: 'page',
    },
  })),
}));

vi.mock('@/utils/backend/shiftData', () => ({
  getShiftData: vi.fn(async () => ({
    shifts: [],
    people: {},
  })),
  shiftNameMappings: {},
}));

describe('resources/queue', () => {
  it('Processes auth-code action messages', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({
      Attributes: {
        phone: 5555551111,
        fName: 'A',
        lName: 'B',
        departments: [ { id: 'Baca', active: true } ],
      },
    });
    (vi.mocked(getPageNumber) as any).mockResolvedValue('+15555551111');
    (vi.mocked(sendMessage) as any).mockResolvedValue(undefined);

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'auth-code',
            phone: 5555551111,
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();
  });

  it('Processes site-status updates', async () => {
    (vi.mocked(typedUpdate) as any).mockResolvedValue({});

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'site-status',
            sites: {
              '1-2': {
                UpdateTime: { TEST: 10 },
                ConvChannel: { TEST: true },
              },
            },
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(typedUpdate).toHaveBeenCalled();
  });

  it('Processes page action and sends notifications', async () => {
    (vi.mocked(getUserRecipients) as any).mockResolvedValue([
      {
        phone: 5555550001,
        getTranscriptOnly: false,
      },
    ]);
    (vi.mocked(getPageNumber) as any).mockResolvedValue('+15555550001');
    (vi.mocked(saveMessageData) as any).mockResolvedValue(undefined);
    (vi.mocked(sendMessage) as any).mockResolvedValue(undefined);
    (vi.mocked(typedScan) as any).mockResolvedValue({ Items: [] });

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'page',
            key: '8198-1735689600',
            tg: 8198,
            len: 4,
            isTest: true,
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalled();
  });

  it('Processes activate-user messages', async () => {
    (vi.mocked(typedGet) as any).mockResolvedValue({
      Item: {
        phone: 5555550001,
        fName: 'A',
        lName: 'B',
        departments: [ { id: 'Baca', active: true } ],
        talkgroups: [ 8198 ],
      },
    });
    (vi.mocked(typedScan) as any).mockResolvedValue({
      Items: [
        {
          phone: 5555550002,
          fName: 'Admin',
          lName: 'One',
          departments: [ { id: 'Baca', active: true, admin: true } ],
        },
      ],
    });
    (vi.mocked(typedQuery) as any).mockResolvedValue({
      Items: [
        {
          Key: 'folder/8198-1735689600',
          Talkgroup: 8198,
        },
      ],
    });
    (vi.mocked(getPageNumber) as any).mockResolvedValue('+15555550001');
    (vi.mocked(saveMessageData) as any).mockResolvedValue(undefined);
    (vi.mocked(sendMessage) as any).mockResolvedValue(undefined);

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'activate-user',
            phone: 5555550001,
            department: 'Baca',
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalled();
  });

  it('Processes phone-issue alerts', async () => {
    (vi.mocked(getUserRecipients) as any).mockResolvedValue([
      {
        phone: 5555550001,
        departments: [ { id: 'Baca', active: true, admin: true } ],
      },
    ]);
    (vi.mocked(getPageNumber) as any).mockResolvedValue('+15555550001');
    (vi.mocked(saveMessageData) as any).mockResolvedValue(undefined);
    (vi.mocked(sendMessage) as any).mockResolvedValue(undefined);

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'phone-issue',
            number: 5555550003,
            name: 'Alert Number',
            department: [ 'Baca' ],
            count: 10,
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalled();
  });

  it('Processes twilio-text announcements for department admins', async () => {
    (vi.mocked(getUserRecipients) as any).mockResolvedValue([
      {
        phone: 5555550001,
      },
    ]);
    (vi.mocked(getPageNumber) as any).mockResolvedValue('+15555550001');
    (vi.mocked(saveMessageData) as any).mockResolvedValue(undefined);
    (vi.mocked(sendMessage) as any).mockResolvedValue(undefined);

    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'twilio-text',
            body: {
              To: '+15550000000',
              Body: 'Station check-in',
            },
            user: {
              phone: 5555550002,
              fName: 'Admin',
              lName: 'User',
              departments: [
                { id: 'Baca', active: true, admin: true },
              ],
              isTest: true,
            },
          }),
        },
      ],
    } as never)).resolves.toBeUndefined();

    expect(saveMessageData).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('Throws for unknown actions', async () => {
    await expect(main({
      Records: [
        {
          body: JSON.stringify({
            action: 'unknown-action',
          }),
        },
      ],
    } as never)).rejects.toThrow('Unkown body');
  });
});
