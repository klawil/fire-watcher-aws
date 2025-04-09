import { api401Body, api403Body, api500Body } from "./_shared";

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
