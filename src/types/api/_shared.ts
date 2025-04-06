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
