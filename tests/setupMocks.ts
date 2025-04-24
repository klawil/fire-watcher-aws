import { beforeEach } from '@jest/globals';

import { resetResults } from '../__mocks__/@aws-sdk/_base';

import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

const logger = getLogger('');

beforeEach(() => {
  resetResults();
  logger.setLevel(LogLevel.Silent);
});
