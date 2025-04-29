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

vi.mock('@/resources/api/v2/_base', async () => {
  const originalModule = await vi.importActual('@/resources/api/v2/_base');

  return {
    ...originalModule,
    getCurrentUser: vi.fn(() => Promise.resolve([
      null,
      {
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      },
      {},
    ])),
  };
});

beforeEach(() => {
  const logger = getLogger('');

  resetResults();
  logger.setLevel(LogLevel.Silent);
});
