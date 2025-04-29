import { vi } from 'vitest';

import { LogLevel } from '../logger';

console.log(LogLevel);

interface Logger {
  name: string;
  level: LogLevel;
  setLevel: (level: LogLevel) => void;
  buildAlert: (msg: string) => void;
  printLog: () => void;
  trace: (str: string, ...args: unknown[]) => void;
  debug: (str: string, ...args: unknown[]) => void;
  info: (str: string, ...args: unknown[]) => void;
  log: (str: string, ...args: unknown[]) => void;
  warn: (str: string, ...args: unknown[]) => void;
  error: (str: string, ...args: unknown[]) => void;
}

function makeDebugLogger(name: string): Logger {
  const logger = {
    name,
    level: LogLevel.Error,
    setLevel: vi.fn(),
    buildAlert: vi.fn(),
    printLog: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  debugLoggers[name] = logger;
  return logger;
}

export const debugLoggers: {
  [key: string]: Logger;
} = {};

export const getLogger = vi.fn(name => makeDebugLogger(name));

export { LogLevel } from '../logger';
