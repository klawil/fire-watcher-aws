import { vi } from 'vitest';

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

  client = vi.fn(() => ({
    send: this.send,
    from: vi.fn(() => this),
  }));

  send = vi.fn(commandRaw => {
    const command = commandRaw as {
      type: string;
    };

    return Promise.resolve({
      ...this.results[command.type] || this.baseResults[command.type] || {},
    });
  });

  getCommand(type: string) {
    const command = vi.fn(data => {
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
