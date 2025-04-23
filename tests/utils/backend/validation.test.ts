import {
  describe, expect, it
} from '@jest/globals';

import { Validator } from '@/types/backend/validation';
import { validateObject } from '@/utils/backend/validation';

interface TestObject {
  numberReq: number;
  stringOpt?: string;
  stringReq: string;
  specificString: 'test' | 'value' | 'other';
  boolReq: boolean;
  arrOpt?: {
    stringReq: string;
    stringOpt?: string;
  }[];
  stringArr?: string[];
}

const testObjectValidator: Validator<TestObject> = {
  numberReq: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {
        regex: /^[0-9]+$/,
      },
    },
  },
  stringOpt: {
    required: false,
    types: {
      string: {
        regex: /^test$/,
      },
    },
  },
  stringReq: {
    required: true,
    types: {
      string: {
        exact: [
          'test',
          'test2',
        ],
      },
    },
  },
  specificString: {
    required: true,
    types: {
      string: {
        exact: [
          'other',
          'test',
          'value',
        ],
      },
    },
  },
  boolReq: {
    required: true,
    types: {
      boolean: {},
    },
  },
  arrOpt: {
    required: false,
    types: {
      array: {
        items: {
          stringReq: {
            required: true,
            types: { string: {}, },
          },
          stringOpt: {
            required: false,
            types: { string: {}, },
          },
        },
      }, // @TODO
    },
  },
  stringArr: {
    required: false,
    types: {
      array: {
        exact: [
          'test',
          'value',
        ],
      },
    },
  },
};

const baseValidObject = {
  numberReq: 125,
  stringReq: 'test',
  specificString: 'other',
  boolReq: false,
};

describe('utils/backend/validation', () => {
  describe('validateObject', () => {
    it('Returns null if a non-object is provided', () => {
      [
        null,
        '',
        1234,
      ].forEach(val => {
        const [
          parsed,
          errs,
        ] = validateObject(val, testObjectValidator);

        expect(parsed).toEqual(null);
        expect(errs).toEqual(Object.keys(testObjectValidator));
      });
    });

    it('Ignores keys that are not defined in the validator and does not return them', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
        stringOpt: 'test',
        key: 1234,
        otherKey: 'test',
      }, testObjectValidator);

      expect(parsed).toEqual({
        ...baseValidObject,
        stringOpt: 'test',
      });
      expect(errs).toEqual([]);
    });

    it('Parses the value using the provided function', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
      }, testObjectValidator);

      expect(parsed).toEqual({
        ...baseValidObject,
      });
      expect(errs).toEqual([]);
    });

    it('Flags values that do not match the provided regex', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
        numberReq: 125.4,
        stringOpt: 'test2',
      }, testObjectValidator);

      expect(parsed).toEqual(null);
      expect(errs).toEqual([
        'numberReq',
        'stringOpt',
      ]);
    });

    it('Flags optional and invalid values', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
        stringOpt: 1234,
        arrOpt: 'test',
        stringArr: false,
      }, testObjectValidator);

      expect(parsed).toEqual(null);
      expect(errs).toEqual([
        'stringOpt',
        'arrOpt',
        'stringArr',
      ]);
    });

    it('Flags exact value requirement failures', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
        stringReq: 'other',
        specificString: 'not-valid',
        stringArr: [
          'test',
          'value',
          'other',
        ],
      }, testObjectValidator);

      expect(parsed).toEqual(null);
      expect(errs).toEqual([
        'stringReq',
        'specificString',
        'stringArr',
      ]);
    });

    it('Flags missing required parameters', () => {
      const input: Partial<TestObject> = { ...baseValidObject as TestObject, };
      delete input.boolReq;
      delete input.numberReq;
      delete input.stringReq;

      const [
        parsed,
        errs,
      ] = validateObject(input, testObjectValidator);

      expect(parsed).toEqual(null);
      expect(errs).toEqual([
        'numberReq',
        'stringReq',
        'boolReq',
      ]);
    });

    it('Does not flag missing and optional values', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
      }, testObjectValidator);

      expect(parsed).toEqual({
        ...baseValidObject,
      });
      expect(errs).toEqual([]);
    });

    it('Flags the items in an array using the validator', () => {
      const [
        parsed,
        errs,
      ] = validateObject({
        ...baseValidObject,
        arrOpt: [
          'test',
          1234,
          { stringReq: 'test', },
          {
            stringReq: 'test',
            stringOpt: 'test',
          },
          { stringOpt: 'test', },
          {
            stringReq: 'test',
            stringOpt: 1234,
          },
        ],
      }, testObjectValidator);

      expect(parsed).toEqual(null);
      expect(errs).toEqual([
        'arrOpt-0-stringReq',
        'arrOpt-0-stringOpt',
        'arrOpt-1-stringReq',
        'arrOpt-1-stringOpt',
        'arrOpt-4-stringReq',
        'arrOpt-5-stringOpt',
      ]);
    });
  });
});
