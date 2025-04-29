import {
  beforeEach,
  vi
} from 'vitest';

import { resetResults } from '../__mocks__/@aws-sdk/_base';

import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

vi.mock('@aws-sdk/client-cloudwatch');
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/client-s3');
vi.mock('@aws-sdk/client-secrets-manager');
vi.mock('@aws-sdk/client-sqs');
vi.mock('@aws-sdk/client-transcribe');
vi.mock('@aws-sdk/lib-dynamodb');
vi.mock('jsonwebtoken');
vi.mock('twilio');

beforeEach(() => {
  const logger = getLogger('');

  resetResults();
  logger.setLevel(LogLevel.Silent);
});
