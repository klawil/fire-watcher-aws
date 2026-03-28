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
import { Department } from '@/types/api/departments';
import { InvoiceItem } from '@/types/api/invoices';
import { TypedScanInput } from '@/types/backend/dynamo';
import {
  TABLE_DEPARTMENT, typedScan
} from '@/utils/backend/dynamoTyped';
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
  endDate.setUTCMilliseconds(0);
  endDate.setUTCSeconds(0);
  endDate.setUTCMinutes(0);
  endDate.setUTCHours(0);
  endDate.setDate(1);
  const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
  startDate.setDate(1);
  endDate = new Date(endDate.getTime() - 1000);
  const startDateAnnual = new Date(startDate.getTime());
  startDateAnnual.setMonth(0);

  // Determine the departments to invoice
  const departmentsScanInput: TypedScanInput<Department> = {
    TableName: TABLE_DEPARTMENT,
    ExpressionAttributeNames: {
      '#invoiceFrequency': 'invoiceFrequency',
    },
    ExpressionAttributeValues: {
      ':monthly': 'monthly',
    },
    FilterExpression: '#invoiceFrequency = :monthly',
  };
  if (
    new Date().getUTCMonth() === 2
  ) {
    departmentsScanInput.ExpressionAttributeValues![':annually'] = 'annually';
    departmentsScanInput.FilterExpression += ' OR #invoiceFrequency = :annually';
  }

  // Get the departments to generate invoices for
  const departmentsToInvoice = await typedScan<Department>(departmentsScanInput);
  if (!departmentsToInvoice.Items) {
    logger.warn('No departments to invoice');
    return;
  }

  // Get the Twilio auth information
  const twilioSecret = await getTwilioSecret();
  await Promise.all(departmentsToInvoice.Items.map(async department => {
    const accountSid = twilioSecret[`accountSid${department.id}` as keyof typeof twilioSecret];
    const authToken = twilioSecret[`authToken${department.id}` as keyof typeof twilioSecret];
    if (
      typeof accountSid === 'undefined' ||
      typeof authToken === 'undefined'
    ) {
      throw new Error(`Unable to find auth for account ${department.id}`);
    }

    // Get the twilio cost information
    const twilioData: InvoiceItem[] = await new Promise((res, rej) => {
      twilio(accountSid, authToken).api.v2010.account.usage.records
        .list({
          includeSubaccounts: true,
          startDate: department.invoiceFrequency === 'annually'
            ? startDateAnnual
            : startDate,
          endDate: endDate,
          pageSize: 1000,
        }, (err, items) => err
          ? rej(err)
          : res(parseTwilioItems(items)));
    });

    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    const invoiceConfig: InvoiceData = {
      invoiceNumber: `${startDate.getUTCFullYear()}-${monthLabels[startDate.getUTCMonth()].slice(0,3).toUpperCase()}-${department.id.toUpperCase()}`,
      issueDate: issueDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      invoiceMonth: `${monthLabels[startDate.getUTCMonth()]} ${startDate.getUTCFullYear()}`,
      clientName: department.name || 'Unknown Department',
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
        ToAddresses: department.invoiceEmail || [],
        BccAddresses: [ FORWARD_EMAIL_TO, ],
      },
      FromEmailAddress: `COFRN Billing <${BILLING_EMAIL_ADDRESS}>`,
      FromEmailAddressIdentityArn: process.env.EMAIL_SOURCE_ARN,
      Content: {
        Simple: {
          Subject: {
            Data: `[COFRN] ${department.name || 'Unknown Department'} ${department.invoiceFrequency === 'annually' ? startDate.getUTCFullYear() : monthLabels[startDate.getUTCMonth()]} Invoice`,
          },
          Body: {
            Text: {
              Data: `Please find attached the invoice for ${department.name}'s COFRN usage for the ${department.invoiceFrequency === 'annually'
                ? `year of ${startDateAnnual.getUTCFullYear()}`
                : `month of ${invoiceConfig.invoiceMonth}`
              }. If you have any questions about this invoice, please reply to this email.`,
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
