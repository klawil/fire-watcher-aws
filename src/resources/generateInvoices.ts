import {
  GetObjectCommand,
  PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import {
  SESv2Client,
  SendEmailCommand
} from '@aws-sdk/client-sesv2';
import PDFDocument from 'pdfkit';
import twilio from 'twilio';
import { RecordInstance } from 'twilio/lib/rest/api/v2010/account/usage/record';

import { getTwilioSecret } from '@/deprecated/utils/general';
import { InvoiceItem } from '@/types/api/invoices';
import {
  TwilioAccounts,
  departmentConfig
} from '@/types/backend/department';
import {
  BILLING_EMAIL_ADDRESS,
  FORWARD_EMAIL_TO,
  PAY_TO_ADDRESS_LINE_1, PAY_TO_ADDRESS_LINE_2, PAY_TO_NAME
} from '@/utils/backend/hidden-constants';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/generateInvoices');
const s3 = new S3Client();
const ses = new SESv2Client();

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  invoiceMonth: string;
  clientName: string;
  lineItems: {
    description: string;
    quantity: string;
    totalPrice: number;
  }[];
}

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
  'mms',
  'sms',
  'channels',
  'totalprice',
];
const monthLabels: string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseTwilioItems(
  items: RecordInstance[]
): InvoiceItem[] {
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

async function generateInvoice(data: InvoiceData) {
  const doc = new PDFDocument({ margin: 50, });
  const chunks: unknown[] = [];
  doc.on('data', chunk => chunks.push(chunk));
  const pdfPromise: Promise<Buffer> = new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks as Uint8Array[])));
  });

  doc.fontSize(24).text('COFRN Invoice', { align: 'center', });
  doc.moveDown();

  // Header Information
  doc.fontSize(16)
    .text('Make Payment To', {
      align: 'left',
      continued: true,
    })
    .text('Bill To', { align: 'right', });
  doc.fontSize(12);
  doc
    .text(PAY_TO_NAME, {
      align: 'left',
      continued: true,
    })
    .text(data.clientName, { align: 'right', })
    .text(PAY_TO_ADDRESS_LINE_1, {
      align: 'left',
      continued: true,
    })
    .text(`Invoice Number: ${data.invoiceNumber}`, { align: 'right', })
    .text(PAY_TO_ADDRESS_LINE_2, {
      align: 'left',
      continued: true,
    })
    .text(`Issue Date: ${data.issueDate}`, { align: 'right', })
    .text(`Due Date: ${data.dueDate}`, { align: 'right', });

  // Line Items Table
  doc.moveDown();
  let totalAmount = 0;
  doc.table({
    defaultStyle: {
      align: {
        x: 'left',
        y: 'center',
      },
      borderColor: 'gray',
      border: 0,
    },
    rowStyles: { border: { bottom: 1, }, },
    data: [
      [
        {
          text: 'Item',
          border: {
            bottom: 2,
          },
          borderColor: 'black',
          align: {
            x: 'center',
          },
        },
        {
          text: 'Quantity',
          border: {
            bottom: 2,
          },
          borderColor: 'black',
          align: {
            x: 'center',
          },
        },
        {
          text: 'Price',
          border: {
            bottom: 2,
          },
          borderColor: 'black',
          align: {
            x: 'center',
          },
        },
      ],
      ...data.lineItems
        .sort((a, b) => a.totalPrice > b.totalPrice ? -1 : 1)
        .map(item => {
          item.totalPrice = Math.round(item.totalPrice * 100) / 100 || 0;
          totalAmount += item.totalPrice;
          const row: Array<string | PDFKit.Mixins.CellOptions> = [
            item.description,
            item.quantity,
            {
              text: `$${item.totalPrice.toFixed(2)}`,
              align: {
                x: 'right',
              },
            },
          ];
          return row;
        }),
    ],
  });

  doc.moveDown();
  doc.fontSize(16).text(`Total: $${totalAmount.toFixed(2)}`, { align: 'right', });

  doc.end();

  return await pdfPromise;
}

export async function main() {
  logger.trace('main', ...arguments);

  // Get the timeframe that we should use
  let endDate = new Date();
  let startDate = new Date();
  endDate = new Date();
  endDate.setUTCMilliseconds(0);
  endDate.setUTCSeconds(0);
  endDate.setUTCMinutes(0);
  endDate.setUTCHours(0);
  endDate.setDate(1);
  startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
  startDate.setDate(1);
  endDate = new Date(endDate.getTime() - 1000);

  // Get the Twilio auth information
  await Promise.all(([
    'Baca',
    'NSCAD',
    'Crestone',
  ] as TwilioAccounts[]).map(async twilioAccount => {
    const twilioSecret = await getTwilioSecret();
    const accountSid = twilioSecret[`accountSid${twilioAccount}`];
    const authToken = twilioSecret[`authToken${twilioAccount}`];
    if (
      typeof accountSid === 'undefined' ||
      typeof authToken === 'undefined'
    ) {
      throw new Error(`Unable to find auth for account ${twilioAccount}`);
    }

    // Get the twilio cost information
    const twilioData: InvoiceItem[] = await new Promise((res, rej) => {
      twilio(accountSid, authToken).api.v2010.account.usage.records
        .list({
          includeSubaccounts: true,
          startDate: startDate,
          endDate: endDate,
          pageSize: 1000,
        }, (err, items) => err
          ? rej(err)
          : res(parseTwilioItems(items)));
    });

    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    const invoiceConfig: InvoiceData = {
      invoiceNumber: `${startDate.getFullYear()}-${monthLabels[startDate.getMonth()].slice(0,3).toUpperCase()}-${twilioAccount.toUpperCase()}`,
      issueDate: issueDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      invoiceMonth: `${monthLabels[startDate.getMonth()]} ${startDate.getFullYear()}`,
      clientName: departmentConfig[twilioAccount as keyof typeof departmentConfig].name,
      lineItems: twilioData.map(item => ({
        description: item.cat,
        quantity: `${item.usage} ${item.usageUnit}`,
        totalPrice: item.price,
      })),
    };
    const pdf = await generateInvoice(invoiceConfig);
    await s3.send(new PutObjectCommand({
      Bucket: process.env.EMAIL_S3_BUCKET,
      Key: `invoices/invoice-${invoiceConfig.invoiceNumber}.pdf`,
      Body: pdf,
      ContentType: 'application/pdf',
    }));
    const pdfBodyS3 = await s3.send(new GetObjectCommand({
      Bucket: process.env.EMAIL_S3_BUCKET,
      Key: `invoices/invoice-${invoiceConfig.invoiceNumber}.pdf`,
    }));
    if (typeof pdfBodyS3.Body === 'undefined') {
      throw new Error('Unable to retrieve PDF from S3 after upload');
    }
    const pdfBody = await pdfBodyS3.Body.transformToByteArray();
    await ses.send(new SendEmailCommand({
      Destination: {
        ToAddresses: [ FORWARD_EMAIL_TO, ],
      },
      FromEmailAddress: `COFRN Billing <${BILLING_EMAIL_ADDRESS}>`,
      FromEmailAddressIdentityArn: process.env.EMAIL_SOURCE_ARN,
      Content: {
        Simple: {
          Subject: {
            Data: `[COFRN] ${departmentConfig[twilioAccount as keyof typeof departmentConfig].name} ${monthLabels[startDate.getMonth()]} Invoice`,
          },
          Body: {
            Text: {
              Data: `Please find attached the invoice for your COFRN usage for the month of ${invoiceConfig.invoiceMonth}. If you have any questions about this invoice, please reply to this email.`,
            },
          },
          Attachments: [ {
            FileName: `${invoiceConfig.invoiceNumber}.pdf`,
            ContentType: 'application/pdf',
            ContentDisposition: 'ATTACHMENT',
            ContentTransferEncoding: 'BASE64',
            RawContent: new Uint8Array(pdfBody),
          }, ],
        },
      },
    }));
  }));
}
