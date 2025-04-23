import { jest } from '@jest/globals';

export const createFn = jest.fn().mockReturnValue(Promise.resolve(false));

export default jest.fn().mockReturnValue({
  messages: {
    create: createFn,
  },
});
