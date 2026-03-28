import {
  GetObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import {
  SESv2Client,
  SendEmailCommand
} from '@aws-sdk/client-sesv2';
import {
  SESEvent, SESEventRecord
} from 'aws-lambda';
import PostalMime from 'postal-mime';

import {
  BILLING_EMAIL_ADDRESS, FORWARD_EMAIL_TO
} from '@/utils/backend/hidden-constants';
import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

const logger = getLogger('resources/emailHandler');
const s3 = new S3Client();
const ses = new SESv2Client();

const EMAIL_S3_BUCKET = process.env.EMAIL_S3_BUCKET || '';
const EMAIL_SOURCE_ARN = process.env.EMAIL_SOURCE_ARN || '';

async function parseEvent(record: SESEventRecord) {
  logger.trace('parseEvent', ...arguments);
  logger.info('Record', record);

  // Pull out the email information
  const email = record.ses.mail;
  logger.info(`Getting email from ${EMAIL_S3_BUCKET} with key /emails/${email.messageId}`);
  const rawData = await s3.send(new GetObjectCommand({
    Bucket: EMAIL_S3_BUCKET,
    Key: `emails/${email.messageId}`,
  }));
  if (typeof rawData.Body === 'undefined') {
    throw new Error('Email body is undefined');
  }
  const emailBody = await rawData.Body.transformToString('utf-8');

  // Parse the body
  const emailParsed = await PostalMime.parse(emailBody);

  // Forward the email
  await ses.send(new SendEmailCommand({
    Destination: {
      ToAddresses: [ FORWARD_EMAIL_TO, ],
    },
    ReplyToAddresses: [ emailParsed.from?.address || BILLING_EMAIL_ADDRESS, ],
    FromEmailAddress: `COFRN Billing <${BILLING_EMAIL_ADDRESS}>`,
    FromEmailAddressIdentityArn: EMAIL_SOURCE_ARN,
    Content: {
      Simple: {
        Subject: {
          Data: `[COFRN] ${emailParsed.subject || 'No Subject'}`,
        },
        Body: {
          ...emailParsed.html
            ? { Html: { Data: emailParsed.html, }, }
            : {},
          ...emailParsed.text
            ? { Text: { Data: emailParsed.text, }, }
            : {},
        },
        ...emailParsed.attachments && emailParsed.attachments.length > 0
          ? {
            Attachments: emailParsed.attachments.map(attachment => ({
              FileName: attachment.filename || 'attachment',
              ContentType: attachment.mimeType,
              ContentDisposition: attachment.disposition === 'inline' ? 'INLINE' : 'ATTACHMENT',
              ContentId: attachment.contentId,
              RawContent: typeof attachment.content === 'string'
                ? Buffer.from(attachment.content, attachment.encoding || 'utf8')
                : new Uint8Array(attachment.content),
            })),
          }
          : {},
      },
    },
  }));
}

export async function main(event: SESEvent) {
  logger.trace('main', ...arguments);
  logger.setLevel(LogLevel.Info);

  // Get the S3 events
  const s3EventRecords: SESEventRecord[] = event.Records || [];
  await Promise.all(s3EventRecords.map(parseEvent));
}
