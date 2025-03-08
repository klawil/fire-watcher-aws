export enum LogLevel {
  Trace,
  Debug,
  Info,
  Log,
  Warn,
  Error,
  Silent,
};
export type ConsoleMethods = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';

let globalLogLevel: LogLevel = LogLevel.Error;
if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
  if (window.location.search.indexOf('debug=') !== -1) {
    const level = parseInt(window.location.search.split('debug=')[1].split('&')[0], 10);
    if (typeof LogLevel[level] !== 'undefined') {
      globalLogLevel = level;
    }
  } else if (window.location.search.indexOf('debug') !== -1) {
    globalLogLevel = LogLevel.Debug;
  }
}
if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
  globalLogLevel = LogLevel.Debug;
  if (typeof process.env.DEBUG !== 'undefined') {
    globalLogLevel = LogLevel.Trace;
  }
}

const levelStrings: string[] = [
  'Trace',
  'Debug',
  'Info',
  'Log',
  'Warn',
  'Error',
];
const maxLevelStringLen: number = levelStrings.reduce(
  (len, str) => str.length > len ? str.length : len,
  0
);
const resetStyleString = '\x1B[m';
const baseLevelStyleString = 'color:{color};font-weight:bold;';
const nameStyleString = `color:white;`;
const levelStyles: string[] = [
  'grey',
  'white',
  'lightblue',
  'lightgreen',
  'orange',
  'red',
].map(color => baseLevelStyleString.replace(/\{color\}/g, color));

let maxLoggerNameLen: number = 0;

type logArguments = [ string, ...any ];

class Logger {
  name: string;
  level: LogLevel = LogLevel.Error;
  maxLevelStringLen = 5;

  constructor(name: string) {
    this.name = name;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  buildAlert(msg: string) {}

  printLog(level: LogLevel, method: ConsoleMethods, ...args: logArguments) {
    // Build an alert if this is an error
    if (level === LogLevel.Error) {
      this.buildAlert(args[0]);
    }

    // Exit early if we shouldn't print this log
    if (this.level > level && globalLogLevel > level) {
      return;
    }

    // Build the logger name portion
    const loggerName = `[ %c${this.name.padEnd(maxLoggerNameLen, ' ')}%c ]`;

    // Build the argument array
    let consoleArgs: [
      string,
      string,
      string,
      ...any
    ] = [
      `${level < LogLevel.Error ? '  ' : ''}[ %c${levelStrings[level].padEnd(maxLevelStringLen, ' ')}%c ]${loggerName}`,
      levelStyles[level],
      resetStyleString,
      nameStyleString,
      resetStyleString,
      ...args,
    ];
    // Remove the title for trace
    if (level === LogLevel.Trace) {
      consoleArgs.splice(0, 3, loggerName);
    }

    // Pass it to the console
    console[method](...consoleArgs);
  }

  trace(...args: logArguments) {
    this.printLog(LogLevel.Trace, 'trace', ...args);
  }

  debug(...args: logArguments) {
    this.printLog(LogLevel.Debug, 'debug', ...args);
  }

  info(...args: logArguments) {
    this.printLog(LogLevel.Info, 'info', ...args);
  }

  log(...args: logArguments) {
    this.printLog(LogLevel.Log, 'log', ...args);
  }

  warn(...args: logArguments) {
    this.printLog(LogLevel.Warn, 'warn', ...args);
  }

  error(...args: logArguments) {
    this.printLog(LogLevel.Error, 'error', ...args);
  }
}

const loggers: { [key: string]: Logger } = {};

export function getLogger(name: string): Logger {
  if (typeof loggers[name] === 'undefined') {
    loggers[name] = new Logger(name);
    if (name.length > maxLoggerNameLen) {
      maxLoggerNameLen = name.length;
    }
  }

  return loggers[name];
}

const logger = getLogger('log');
logger.warn(`Log level ${LogLevel[globalLogLevel]}`);
