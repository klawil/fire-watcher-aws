type PossibleTypes = 'string' | 'number' | 'boolean' | 'array' | 'null';
type TypeValidations = {
  [type in PossibleTypes]: {
    regex?: RegExp;
    exact?: readonly (string | number | boolean)[];
  };
};
type SpecificTypeValidations<V> = Pick<
  TypeValidations,
  {
    string: string extends V ? 'string' : never;
    number: V extends number ? 'number' : never;
    boolean: V extends boolean ? 'boolean' : never;
    array: Array<unknown> extends V ? 'array' : never;
    null: V extends null ? 'null' : never;
  }[keyof TypeValidations]
> & Partial<TypeValidations>;
export type Validator<T> = {
  [key in keyof T]: {
    required: undefined extends T[key] ? false : true;
    parse?: (v: string) => T[key];
    types: SpecificTypeValidations<T[key]>;
  };
};

export type OrNull<T extends object> = {
  [key in keyof T]: T[key] | null;
};
