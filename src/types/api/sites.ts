import { api401Body, api403Body, api500Body } from "./_shared";

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
