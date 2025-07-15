import { Validator } from '../backend/validation';

import {
  api400Body,
  api401Body, api403Body, api404Body, api500Body
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

/**
 * Update the name of a radio
 * @summary Set Radio Name
 * @tags Radios
 * @body.contentType application/json
 * @contentType application/json
 */
export type PatchRadioApi = {
  path: '/api/v2/radios/{id}/';
  method: 'PATCH';
  params: {

    /**
     * Radio ID (will generally be an integer)
     */
    id: string;
  };
  body: {

    /**
     * New name for the talkgroup. Pass null to delete the name. Name may not contain newline or
     * tab characters
     */
    name: string | null;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: RadioObject;

    /**
     * @contentType application/json
     */
    400: typeof api400Body;

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
    404: typeof api404Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    cookie: [],
  }];
};

export const patchRadioApiParamsValidator: Validator<PatchRadioApi['params']> = {
  id: {
    required: true,
    types: {
      string: {},
    },
  },
};

export const patchRadioApiBodyValidator: Validator<PatchRadioApi['body']> = {
  name: {
    required: true,
    types: {
      string: {},
      null: {},
    },
  },
};
