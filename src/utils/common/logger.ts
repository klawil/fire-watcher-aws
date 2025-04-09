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
let isNodeEnv: boolean = false;
declare const window: undefined | Window;
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
declare const process: undefined | NodeJS.Process;
if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
  isNodeEnv = true;
  globalLogLevel = LogLevel.Error;
  if (typeof process.env.DEBUG !== 'undefined') {
    globalLogLevel = LogLevel.Trace;
  }
}
const stylePlaceholder = isNodeEnv ? '' : '%c';

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

type logArguments = [ string, ...unknown[] ];

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

  buildAlert(msg: string) {} // eslint-disable-line @typescript-eslint/no-unused-vars

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
    const loggerName = `[ ${stylePlaceholder}${this.name.padEnd(maxLoggerNameLen, ' ')}${stylePlaceholder} ]`;
    let styles: string[] = [
      levelStyles[level],
      resetStyleString,
    ];

    // Build the first portion of the log
    let logPrefix = ''; 
    if (!isNodeEnv) {
      logPrefix = `${level < LogLevel.Error ? '  ' : ''}[ ${stylePlaceholder}${levelStrings[level].padEnd(maxLevelStringLen, ' ')}${stylePlaceholder} ]`;
      if (level !== LogLevel.Trace) {
        styles.push(
          nameStyleString,
          resetStyleString,
        );
      }
    } else {
      styles = [];
    }
    logPrefix += loggerName;

    // Build the argument array
    const consoleArgs: [
      string,
      ...unknown[],
    ] = [
      logPrefix,
      ...styles,
      ...args,
    ];
    // Remove the title for trace
    if (level === LogLevel.Trace) {
      consoleArgs.splice(0, 1, loggerName);
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
