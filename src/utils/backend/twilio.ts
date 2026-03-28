import twilio from 'twilio';
import { RecordInstance } from 'twilio/lib/rest/api/v2010/account/usage/record';
import { DailyInstance } from 'twilio/lib/rest/api/v2010/account/usage/record/daily';
import { MonthlyInstance } from 'twilio/lib/rest/api/v2010/account/usage/record/monthly';

import { InvoiceItem } from '@/types/api/invoices';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('utils/backend/twilio');

const twilioCategoryLabels: { [key: string]: string } = {
  'phonenumbers': 'Phone Numbers',
  'sms-outbound': 'Outbound SMS',
  'mms-outbound': 'Outbound MMS',
  'sms-inbound': 'Inbound SMS',
  'mms-inbound': 'Inbound MMS',
  'sms-messages-carrierfees': 'SMS Carrier Fees',
  'mms-messages-carrierfees': 'MMS Carrier Fees',
};
const twilioCategorySkips: string[] = [
  'sms',
  'channels',
  'totalprice',
];

function parseTwilioItems(
  items: RecordInstance[] | DailyInstance[] | MonthlyInstance[]
): InvoiceItem[] {
  logger.trace('parseTwilioItems', ...arguments);
  return items
    // .filter(item => typeof twilioCategoryLabels[item.category] !== 'undefined')
    .filter(item => Number(item.price) > 0)
    .filter(item => !twilioCategorySkips.includes(item.category) && (
      typeof twilioCategoryLabels[item.category] !== 'undefined' ||
      !Object.keys(twilioCategoryLabels).some(k => item.category.startsWith(k))
    ))
    .map(item => ({
      type: 'twilio',
      cat: twilioCategoryLabels[item.category] || item.category,
      price: Number(item.price),
      usage: Number(item.usage),
      usageUnit: item.usageUnit,
      start: item.startDate,
      end: item.endDate,
    }));
}

export function getTwilioItems(
  accountSid: string,
  authToken: string,
  startDate: Date,
  endDate: Date,
  by: 'day' | 'month' | 'all' = 'all'
) {
  logger.trace('getTwilioItems', ...arguments);

  return new Promise<InvoiceItem[]>((res, rej) => {
    if (by === 'day') {
      twilio(accountSid, authToken).api.v2010.account.usage.records.daily
        .list({
          includeSubaccounts: true,
          startDate: startDate,
          endDate: endDate,
          pageSize: 1000,
        }, (err, items) => err
          ? rej(err)
          : res(parseTwilioItems(items)));
    } else if (by === 'month') {
      twilio(accountSid, authToken).api.v2010.account.usage.records.monthly
        .list({
          includeSubaccounts: true,
          startDate: startDate,
          endDate: endDate,
          pageSize: 1000,
        }, (err, items) => err
          ? rej(err)
          : res(parseTwilioItems(items)));
    } else {
      twilio(accountSid, authToken).api.v2010.account.usage.records
        .list({
          includeSubaccounts: true,
          startDate: startDate,
          endDate: endDate,
          pageSize: 1000,
        }, (err, items) => err
          ? rej(err)
          : res(parseTwilioItems(items)));
    }
  });
}
