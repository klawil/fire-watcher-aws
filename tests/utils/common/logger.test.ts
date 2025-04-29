import {
  beforeEach,
  describe, expect, it,
  vi
} from 'vitest';

import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

vi.unmock('@/utils/common/logger');

describe('utils/common/logger', () => {
  let logger: ReturnType<typeof getLogger>;

  beforeEach(() => {
    logger = getLogger('test');
  });

  describe('getLogger', () => {
    it('Starts out with the default log level', () => {
      expect(logger.level).toEqual(LogLevel.Error);
    });

    it('Returns the same logger if the same label is passed in', () => {
      const newLogger = getLogger('test');

      expect(newLogger).toEqual(logger);
    });

    it('Returns a different logger if a different label is passed in', () => {
      const newLogger = getLogger('tst');

      expect(newLogger).not.toEqual(logger);
    });
  });

  describe('Logger', () => {
    const methods = [
      'trace',
      'debug',
      'info',
      'log',
      'warn',
      'error',
    ] as const;

    [
      LogLevel.Trace,
      LogLevel.Debug,
      LogLevel.Info,
      LogLevel.Log,
      LogLevel.Warn,
      LogLevel.Error,
      LogLevel.Silent,
    ].forEach(level => {
      methods.forEach((method, idx) => {
        it(`${level < idx ? 'Does not log' : 'Logs'} ${method} if the log level is ${methods[idx] || 'silent'}`, () => {
          logger.setLevel(level);

          vi.spyOn(console, method).mockImplementation(() => {});

          logger[method]('test-value');

          if (level <= idx) {
            expect(console[method]).toHaveBeenCalledTimes(1);
            expect(console[method]).toHaveBeenCalledWith('[ test ]', 'test-value');
          } else {
            expect(console[method]).toHaveBeenCalledTimes(0);
          }
        });
      });
    });
  });
});
