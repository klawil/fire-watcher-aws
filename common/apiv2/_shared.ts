export const api200Body = {
  message: 'Success',
} as const;
export const api200Response = {
  statusCode: 200,
  body: JSON.stringify(api200Body),
};

export interface api400Body {
  message: 'Invalid request body';
  errors: string[];
}
export const api400Body: api400Body = {
  message: 'Invalid request body',
  errors: [],
};
export function generateApi400Body(errors: string[]) {
  return {
    ...api400Body,
    errors,
  };
}

export const api401Body = {
  message: 'Missing Authentication Token',
} as const;
export const api401Response = {
  statusCode: 401,
  body: JSON.stringify(api401Body),
};

export const api403Body = {
  message: 'Missing Authentication Token',
} as const;
export const api403Response = {
  statusCode: 403,
  body: JSON.stringify(api403Body),
};

export const api404Body = {
  message: 'Resource not found',
} as const;
export const api404Response = {
  statusCode: 404,
  body: JSON.stringify(api404Body),
};

export const api500Body = {
  message: 'Internal server error',
} as const;
export const api500Response = {
  statusCode: 500,
  body: JSON.stringify(api500Body),
};

export type OrNull<T extends object> = {
  [key in keyof T]: T[key] | null;
};

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
    array: Array<any> extends V ? 'array' : never;
    null: V extends null ? 'null' : never;
  }[keyof TypeValidations]
> & Partial<TypeValidations>;
// export type Validator<T> = {
//   [key in keyof T]: undefined extends T[key] ? {
//     parse?: (v: string) => T[key];
//     types: SpecificTypeValidations<T[key]>;
//   } : {
//     required: true;
//     parse?: (v: string) => T[key];
//     types: SpecificTypeValidations<T[key]>;
//   };
// };
export type Validator<T> = {
  [key in keyof T]: {
    required: undefined extends T[key] ? false : true;
    parse?: (v: string) => T[key];
    types: SpecificTypeValidations<T[key]>;
  };
};
