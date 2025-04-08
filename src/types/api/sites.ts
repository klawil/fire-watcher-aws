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
