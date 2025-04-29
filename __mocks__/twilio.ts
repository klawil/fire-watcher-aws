import { vi } from 'vitest';

export const createFn = vi.fn(() => Promise.resolve(false));

export const validateRequest = vi.fn(() => true);

export default vi.fn(() => ({
  messages: {
    create: createFn,
  },
}));
