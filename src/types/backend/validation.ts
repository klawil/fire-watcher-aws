type ExactValues<V, key> = key extends 'array'
  ? V extends any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    ? readonly V[number][]
    : readonly V[]
  : readonly V[];

type PossibleTypes = 'string' | 'number' | 'boolean' | 'array' | 'null';

type BaseTypeValidation<V, type> = {
  regex?: RegExp;
  exact?: ExactValues<V, type>;
};
export type ArrayTypeValidations<V> = BaseTypeValidation<V, 'array'> & {
  items?: V extends Array<unknown> ? Validator<V[number]> : never;
};

type SpecificTypeValidations<V> = Pick<
  ({
    [type in Exclude<PossibleTypes, 'array' | 'object'>]: BaseTypeValidation<V, type>;
  } & {
    array: ArrayTypeValidations<V>;
  }),
  {
    string: V extends string ? 'string' : never;
    number: V extends number ? 'number' : never;
    boolean: V extends boolean ? 'boolean' : never;
    array: V extends Array<unknown> ? 'array' : never;
    null: V extends null ? 'null' : never;
  }[PossibleTypes]
> & {
  [key in PossibleTypes]?: {
    regex?: RegExp;
    exact?: ExactValues<V, key>;
  };
};
export type Validator<T> = {
  [key in keyof Required<T>]: {
    required: undefined extends T[key] ? false : true;
    parse?: (v: string) => T[key];
    types: SpecificTypeValidations<T[key]>;
  };
};

export type OrNull<T extends object> = {
  [key in keyof T]: T[key] | null;
};
