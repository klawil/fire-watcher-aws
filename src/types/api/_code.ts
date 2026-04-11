import { API_CODE } from '../backend/environment';
import { Validator } from '../backend/validation';

export const apiCodeValidator: Validator<{
  code: string;
}> = {
  code: {
    required: true,
    types: {
      string: {
        exact: [ API_CODE(), ],
      },
    },
  },
};
