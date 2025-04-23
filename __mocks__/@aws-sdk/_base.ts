import { jest } from '@jest/globals';

const instances: BaseClientMock[] = [];

export function resetResults() {
  instances.forEach(instance => {
    Object.keys(instance.results).forEach(key => {
      instance.setResult(key, {});
    });
  });
}

export class BaseClientMock {
  results: Record<string, object> = {};
  baseResults: Record<string, object> = {};

  constructor() {
    instances.push(this);
  }

  client = jest.fn().mockImplementation(() => ({
    send: this.send,
    from: jest.fn().mockReturnValue(this),
  }));

  send = jest.fn().mockImplementation(commandRaw => {
    const command = commandRaw as {
      type: string;
    };

    return Promise.resolve({
      ...this.results[command.type] || this.baseResults[command.type] || {},
    });
  });

  getCommand(type: string) {
    const command = jest.fn().mockImplementation(data => {
      return {
        ...data as object,
        type,
      };
    });
    return command;
  }

  setResult(type: string, result: object) {
    this.results[type] = {
      ...result,
    };
  }
}
