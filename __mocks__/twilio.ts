import { jest } from '@jest/globals';

export const createFn = jest.fn().mockReturnValue(Promise.resolve(false));

export const validateRequest = jest.fn().mockReturnValue(true);

export default jest.fn().mockReturnValue({
  messages: {
    create: createFn,
  },
});
