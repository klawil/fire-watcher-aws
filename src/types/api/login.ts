import { Validator } from "../backend/validation";
import { api200Body, api400Body, api403Body, api500Body } from "./_shared";
import { FrontendUserObject } from "@/types/api/users";

/**
 * Request that a login code be sent to the user's phone
 * @summary Request Login Code
 * @tags Authentication
 * @body.contentType application/json
 */
export type GetLoginCodeApi = {
  path: '/api/v2/login/{id}/';
  method: 'GET';
  params: {
    /**
     * The user ID (10 digit phone number) to send the code for
     * @format integer
     */
    id: number;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: typeof api200Body;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
}

/**
 * Submit a login code to authenticate a user
 * @summary Submit Login Code
 * @tags Authentication
 * @body.contentType application/json
 */
export type SubmitLoginCodeApi = {
  path: '/api/v2/login/{id}/';
  method: 'POST';
  params: {
    /**
     * The user ID (10 digit phone number) to authenticate as
     * @format integer
     */
    id: number;
  };
  body: {
    code: string;
  };
  responses: {
    /**
     * @contentType application/json
     */
    200: FrontendUserObject;
    /**
     * @contentType application/json
     */
    400: typeof api400Body;
    /**
     * @contentType application/json
     */
    403: typeof api403Body;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
}

export const loginApiParamsValidator: Validator<GetLoginCodeApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {
        regex: /^[0-9]{10}$/,
      },
    },
  },
}

export const loginApiCodeBodyValidator: Validator<SubmitLoginCodeApi['body']> = {
  code: {
    required: true,
    types: {
      string: {
        regex: /^[0-9]{6}$/,
      },
    },
  },
};
