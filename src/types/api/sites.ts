import { Validator } from '../backend/validation';

import {
  api200Body,
  api400Body,
  api401Body, api403Body, api500Body
} from './_shared';

export interface AdjacentSiteBodyItem {
  time: string;
  rfss: string;
  site: string;
  sys_shortname: string;
  conv_ch: boolean;
  site_failed: boolean;
  valid_info: boolean;
  composite_ctrl: boolean;
  active_conn: boolean;
  backup_ctrl: boolean;
  no_service_req: boolean;
  supports_data: boolean;
  supports_voice: boolean;
  supports_registration: boolean;
  supports_authentication: boolean;
}

interface SiteObjectValue<T = boolean> {
  [tower: string]: T;
}

export interface FullSiteObject {
  SiteId: string;
  SiteName?: string;

  IsActive?: 'y' | 'n';
  SiteCounty?: string;
  SiteLat?: number;
  SiteLon?: number;
  SiteRng?: number;

  // Dynamic data
  ActiveConn?: SiteObjectValue;
  BackupCtrl?: SiteObjectValue;
  CompositeCtrl?: SiteObjectValue;
  ConvChannel?: SiteObjectValue;
  NoServReq?: SiteObjectValue;
  SiteFailed?: SiteObjectValue;
  SupportAuth?: SiteObjectValue;
  SupportData?: SiteObjectValue;
  SupportReg?: SiteObjectValue;
  SupportVoice?: SiteObjectValue;
  ValidInfo?: SiteObjectValue;
  UpdateTime?: SiteObjectValue<number>;
}

export type DynamicSiteKeys = Extract<{
  [key in keyof FullSiteObject]: SiteObjectValue<boolean> extends FullSiteObject[key]
    ? key
    : SiteObjectValue<number> extends FullSiteObject[key]
      ? key
      : never;
}[keyof FullSiteObject], string>;

/**
 * Retrieve a list of sites that have information
 * @summary Retrieve Sites List
 * @tags Sites
 */
export type GetAllSitesApi = {
  path: '/api/v2/sites/';
  method: 'GET';
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      count: number;
      sites: FullSiteObject[];
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

/**
 * Update site information from the DTR recorders
 * @summary Update Site Information
 * @tags Sites
 */
export type UpdateSitesApi = {
  path: '/api/v2/sites/';
  method: 'POST';
  body: {
    adjacent: ('' | AdjacentSiteBodyItem[])[];
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
    401: typeof api401Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
  security: [{
    apiKey: [],
  }];
};

export const adjacentSiteItemValidator: Validator<AdjacentSiteBodyItem> = {
  time: {
    required: true,
    types: { string: {
      regex: /^[0-9]+$/,
    }, },
  },
  rfss: {
    required: true,
    types: { string: {}, },
  },
  site: {
    required: true,
    types: { string: {}, },
  },
  sys_shortname: {
    required: true,
    types: { string: {}, },
  },
  conv_ch: {
    required: true,
    types: { boolean: {}, },
  },
  site_failed: {
    required: true,
    types: { boolean: {}, },
  },
  valid_info: {
    required: true,
    types: { boolean: {}, },
  },
  composite_ctrl: {
    required: true,
    types: { boolean: {}, },
  },
  active_conn: {
    required: true,
    types: { boolean: {}, },
  },
  backup_ctrl: {
    required: true,
    types: { boolean: {}, },
  },
  no_service_req: {
    required: true,
    types: { boolean: {}, },
  },
  supports_data: {
    required: true,
    types: { boolean: {}, },
  },
  supports_voice: {
    required: true,
    types: { boolean: {}, },
  },
  supports_registration: {
    required: true,
    types: { boolean: {}, },
  },
  supports_authentication: {
    required: true,
    types: { boolean: {}, },
  },
};

export const updateSitesBodyValidator: Validator<UpdateSitesApi['body']> = {
  adjacent: {
    required: true,
    types: {
      array: {},
    },
  },
};
