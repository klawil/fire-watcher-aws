import {
  api401Body, api500Body
} from './_shared';

export interface RadioObject {
  RadioID: string;
  Name: string;
}

/**
 * Retrieve a list of radio IDs to names
 * @summary Retrieve Radio List
 * @tags Radios
 */
export type GetAllRadiosApi = {
  path: '/api/v2/radios/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      count: number;
      radios: RadioObject[];
    };

    /**
     * @contentType application/json
     */
    401: typeof api401Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
};
