import { Validator } from '../backend/validation';

import { apiCodeValidator } from './_code';
import {
  api400Body,
  api401Body, api403Body, api500Body
} from './_shared';

export interface Heartbeat {
  Server: string;
  LastHeartbeat?: number;
  IsActive?: boolean;
  IsFailed?: boolean;
  IsPrimary?: boolean;
}

/**
 * Retrieve the current heartbeat information from the VHF recorders
 * @summary Retrieve Current Recorder State
 * @tags Heartbeats
 */
export type GetAllHeartbeatsApi = {
  path: '/api/v2/heartbeats/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: Heartbeat[];

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

/**
 * Add a heartbeat from a recorder
 * @summary Add Heartbeat
 * @tags Heartbeats
 * @body.contentType application/json
 */
export type AddHeartbeatApi = {
  path: '/api/v2/heartbeats/';
  method: 'POST';
  body: {

    /**
     * The name of the server that is sending the heartbeat
     */
    Server: string;

    /**
     * Is this server self-identifying as the primary server?
     */
    IsPrimary: boolean;

    /**
     * Is this server actively uploading files?
     */
    IsActive: boolean;

    /**
     * The API code for validation
     */
    code: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: Heartbeat[];

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
    500: typeof api500Body;
  };
  security: [{
    apiKey: [];
  }];
};

export const addHeartbeatBodyValidator: Validator<AddHeartbeatApi['body']> = {
  ...apiCodeValidator,
  Server: {
    required: true,
    types: { string: {}, },
  },
  IsPrimary: {
    required: true,
    types: { boolean: {}, },
  },
  IsActive: {
    required: true,
    types: { boolean: {}, },
  },
};
