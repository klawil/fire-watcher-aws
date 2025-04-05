import { APIGatewayProxyEvent } from "aws-lambda";
import * as twilio from 'twilio';
import { PhoneNumberConfig, TwilioConfig } from "../../utils/general";
import { getLogger } from "../../utils/logger";
import { CreateTextApi } from "@/common/apiv2/twilio";

const logger = getLogger('_twilio');

export function validateTwilioRequest(
  event: APIGatewayProxyEvent,
  query: CreateTextApi['query'],
  bodyObj: {
    [key: string]: unknown;
  },
  phoneNumberConf: PhoneNumberConfig,
  twilioConf: TwilioConfig,
): [ boolean, boolean ] {
  // Get the information needed out of the request
  const signature = event.headers['X-Twilio-Signature'];
  const url = `${event.headers['X-Forwarded-Proto']}://${event.headers['X-Forwarded-Host']}${event.path}`;
  const isTest = typeof signature === 'undefined';

  // Validate a production request
  if (
    !isTest &&
    !twilio.validateRequest(
      twilioConf[`authToken${phoneNumberConf.account || ''}`],
      signature || '',
      url,
      bodyObj,
    )
  ) {
    logger.error('Not Verified');
    return [
      false,
      isTest,
    ];
  }
  
  // Validate a test request
  if (
    isTest &&
    (
      typeof query.code === 'undefined' ||
      query.code !== twilioConf.apiCode
    )
  ) {
    logger.error('Not verified - test mode');
    return [
      false,
      isTest,
    ];
  }

  return [
    true,
    isTest,
  ];
}
