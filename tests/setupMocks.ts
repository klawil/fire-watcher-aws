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

// Spy on all of the internal modules
vi.mock('@/deprecated/common/weather', { spy: true, });
vi.mock('@/deprecated/utils/dynamo', { spy: true, });
vi.mock('@/deprecated/utils/dynamodb', { spy: true, });
vi.mock('@/deprecated/utils/general', { spy: true, });
vi.mock('@/resources/api/v2/_base', { spy: true, });
vi.mock('@/resources/api/v2/_twilio', { spy: true, });
vi.mock('@/utils/backend/dynamoTyped', { spy: true, });
vi.mock('@/utils/backend/texts', { spy: true, });
vi.mock('@/utils/backend/validation', { spy: true, });
vi.mock('@/utils/common/dateAndFile', { spy: true, });
vi.mock('@/utils/common/logger');
vi.mock('@/utils/common/strings', { spy: true, });
vi.mock('@/utils/common/user', { spy: true, });

beforeEach(() => {
  const logger = getLogger('');

  resetResults();
  logger.setLevel(LogLevel.Silent);
});
