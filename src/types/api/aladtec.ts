import {
  api401Body, api403Body, api500Body
} from './_shared';

/**
 * Retrieve a mapping of AladTec ID to AladTec Name
 * @summary Retrieve AladTec Users
 * @tags Users
 */
export type GetAladtecUsersApi = {
  path: '/api/v2/aladtec/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      [key: string]: string;
    };

    /**
     * @contentType application/json
     */
    401: typeof api401Body;

    /**
     * @contentType application/json
     */
    403: typeof api403Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
};
