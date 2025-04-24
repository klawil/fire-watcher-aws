import {
  describe, expect, it
} from '@jest/globals';

import { validateRequest } from '../../../../__mocks__/twilio';
import { twilioConf } from '../../../../__mocks__/twilioConfig';

import { generateApiEvent } from './_utils';

import { validateTwilioRequest } from '@/resources/api/v2/_twilio';

describe('resources/api/v2/_twilio', () => {
  describe('validateTwilioRequest', () => {
    const phoneNumberConfig = {
      number: '+15555555555',
      numberKey: 'phoneNumberpage',
      type: 'page',
    } as const;

    it('Returns true if the production request is validated', () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '/path',
        headers: {
          'X-Twilio-Signature': 'TwilioSignature',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });

      expect(validateTwilioRequest(
        req,
        {},
        {},
        phoneNumberConfig,
        twilioConf
      )).toEqual([
        true,
        false,
      ]);

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(validateRequest).toHaveBeenCalledWith(
        'authToken',
        'TwilioSignature',
        'https://test.com/path',
        {}
      );
    });

    it('Returns false if the production request is not validated', () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '/path',
        headers: {
          'X-Twilio-Signature': 'TwilioSignature',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });

      validateRequest.mockReturnValue(false);

      expect(validateTwilioRequest(
        req,
        {},
        {},
        phoneNumberConfig,
        twilioConf
      )).toEqual([
        false,
        false,
      ]);

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(validateRequest).toHaveBeenCalledWith(
        'authToken',
        'TwilioSignature',
        'https://test.com/path',
        {}
      );
    });

    it('Returns true if the test request is validated', () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '/path',
        headers: {
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });

      expect(validateTwilioRequest(
        req,
        {
          code: 'apiCodeValue',
        },
        {},
        phoneNumberConfig,
        twilioConf
      )).toEqual([
        true,
        true,
      ]);

      expect(validateRequest).toHaveBeenCalledTimes(0);
    });

    it('Returns false if the test request is not validated', () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '/path',
        headers: {
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });

      validateRequest.mockReturnValue(false);

      expect(validateTwilioRequest(
        req,
        {
          code: 'apiCodeValueWrong',
        },
        {},
        phoneNumberConfig,
        twilioConf
      )).toEqual([
        false,
        true,
      ]);

      expect(validateRequest).toHaveBeenCalledTimes(0);
    });
  });
});
