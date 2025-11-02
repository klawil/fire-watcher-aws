import { Validator } from '../backend/validation';

export const apiCodeValidator: Validator<{
  code: string;
}> = {
  code: {
    required: true,
    types: {
      string: {
        exact: [ process.env.API_CODE, ],
      },
    },
  },
};
