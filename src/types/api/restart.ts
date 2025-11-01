import { Validator } from '../backend/validation';

import {
  api400Body,
  api401Body, api403Body, api500Body
} from './_shared';

/**
 * Determine if a tower recorder should be restarted
 * @summary Determine Tower Restart
 * @tags Restart
 */
export type GetShouldRestartApi = {
  path: '/api/v2/restart/{tower}/';
  method: 'GET';
  params: {

    /**
     * The tower that the server can restart
     */
    tower: 'Saguache' | 'PoolTable' | 'SanAntonio';
  };
  responses: {
    204: '0';
    205: '1';

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
    500: typeof api500Body;
  };
  security: [{
    apiKey: [];
  }];
};

/**
 * Notify the server that a tower recorder was restarted
 * @summary Notify Tower Restarted
 * @tags Restart
 */
export type DidRestartApi = {
  path: '/api/v2/restart/{tower}/';
  method: 'POST';
  params: {

    /**
     * The tower that was restarted
     */
    tower: 'Saguache' | 'PoolTable' | 'SanAntonio';
  };
  responses: {
    200: '';

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
    500: typeof api500Body;
  };
  security: [{
    apiKey: [];
  }];
};

export const restartApiValidator: Validator<GetShouldRestartApi['params']> = {
  tower: {
    required: true,
    types: {
      string: {
        exact: [
          'PoolTable',
          'Saguache',
          'SanAntonio',
        ],
      },
    },
  },
};
