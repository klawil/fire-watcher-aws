/**
 * @deprecated The method should not be used
 */
export type FireTypes = 'new' | 'ongoing' | 'rx';

// Source: https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations/FeatureServer/0
export interface FireInfo {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    OBJECTID: number;
    ABCDMisc: string | null;
    ADSPermissionState: string | null;
    ContainmentDateTime: number | null;
    ControlDateTime: number | null;
    CpxID: string | null;
    CpxName: string | null;
    CreatedBySystem: string | null;
    CreatedOnDateTime_dt: number | null;
    DiscoveryAcres: number | null;
    DispatchCenterID: string | null;
    EstimatedCostToDate: number | null;
    EstimatedFinalCost: number | null;
    FinalAcres: number | null;
    FinalFireReportApprovedByTitle: string | null;
    FinalFireReportApprovedByUnit: string | null;
    FinalFireReportApprovedDate: number | null;
    FireBehaviorGeneral: string | null;
    FireBehaviorGeneral1: string | null;
    FireBehaviorGeneral2: string | null;
    FireBehaviorGeneral3: string | null;
    FireCause: string | null;
    FireCauseGeneral: string | null;
    FireCauseSpecific: string | null;
    FireCode: string | null;
    FireDepartmentID: string | null;
    FireDiscoveryDateTime: number | null;
    FireMgmtComplexity: string | null;
    FireOutDateTime: number | null;
    FireStrategyConfinePercent: number | null;
    FireStrategyFullSuppPercent: number | null;
    FireStrategyMonitorPercent: number | null;
    FireStrategyPointZonePercent: number | null;
    FSJobCode: string | null;
    FSOverrideCode: string | null;
    GACC: string | null;
    GlobalID: number;
    ICS209ReportDateTime: number | null;
    ICS209ReportForTimePeriodFrom: number | null;
    ICS209ReportForTimePeriodTo: number | null;
    ICS209ReportStatus: string | null;
    IncidentComplexityLevel: string | null;
    IncidentManagementOrganization: string | null;
    IncidentName: string | null;
    IncidentShortDescription: string | null;
    IncidentSize: number | null;
    IncidentTypeCategory: string | null;
    IncidentTypeKind: string | null;
    InitialLatitude: number | null;
    InitialLongitude: number | null;
    InitialResponseAcres: number | null;
    InitialResponseDateTime: number | null;
    IrwinID: string | null;
    IsCpxChild: number | null;
    IsFireCauseInvestigated: number | null;
    IsFireCodeRequested: number | null;
    IsFSAssisted: number | null;
    IsMultiJurisdictional: number | null;
    IsQuarantined: number | null;
    IsReimbursable: number | null;
    IsTrespass: number | null;
    IsUnifiedCommand: number | null;
    IsValid: number | null;
    LocalIncidentIdentifier: string | null;
    ModifiedOnDateTime_dt: number | null;
    OrganizationalAssessment: string | null;
    PercentContained: number | null;
    PercentPerimeterToBeContained: number | null;
    POOCity: string | null;
    POOCounty: string | null;
    POODispatchCenterID: string | null;
    POOFips: string | null;
    POOJurisdictionalAgency: string | null;
    POOJurisdictionalUnit: string | null;
    POOJurisdictionalUnitParentUnit: string | null;
    POOLandownerCategory: string | null;
    POOLandownerKind: string | null;
    POOLegalDescPrincipalMeridian: string | null;
    POOLegalDescQtr: string | null;
    POOLegalDescQtrQtr: string | null;
    POOLegalDescRange: string | null;
    POOLegalDescSection: number | null;
    POOLegalDescTownship: string | null;
    POOPredictiveServiceAreaID: string | null;
    POOProtectingAgency: string | null;
    POOProtectingUnit: string | null;
    POOState: string | null;
    PredominantFuelGroup: string | null;
    PredominantFuelModel: string | null;
    PrimaryFuelModel: string | null;
    SecondaryFuelModel: string | null;
    SourceGlobalID: string | null;
    SourceOID: number | null;
    StrategicDecisionPublishDate: number | null;
    TotalIncidentPersonnel: number | null;
    UniqueFireIdentifier: string | null;
    WFDSSDecisionStatus: string | null;
  };
}

export function isFireActive(f: FireInfo): boolean {
  return f.properties.ContainmentDateTime === null &&
    f.properties.ControlDateTime === null &&
    f.properties.FireOutDateTime === null &&
    f.properties.ModifiedOnDateTime_dt !== null &&
    f.properties.ModifiedOnDateTime_dt >= Date.now() - (48 * 60 * 60 * 1000);
}

export function getFireType(f: FireInfo): FireTypes {
  if (f.properties.IncidentTypeCategory === 'RX') {
    return 'rx';
  }
  if ((f.properties?.FireDiscoveryDateTime || 0) >= Date.now() - (24 * 60 * 60 * 1000)) {
    return 'new';
  }
  return 'ongoing';
}

type FeaturePropertyString = string | null;
type FeaturePropertyNumber = number | null;

export interface FireData {
  activeFires: {
    type: 'Feature';
    id: number;
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      ContainmentDateTime: FeaturePropertyNumber;
      ControlDateTime: FeaturePropertyNumber;
      CpxName: FeaturePropertyString;
      DiscoveryAcres: FeaturePropertyNumber;
      EstimatedCostToDate: FeaturePropertyNumber;
      EstimatedFinalCost: FeaturePropertyNumber;
      FinalAcres: FeaturePropertyNumber;
      FireBehaviorGeneral: FeaturePropertyString;
      FireBehaviorGeneral1: FeaturePropertyString;
      FireBehaviorGeneral2: FeaturePropertyString;
      FireBehaviorGeneral3: FeaturePropertyString;
      FireCause: FeaturePropertyString;
      FireCauseGeneral: FeaturePropertyString;
      FireCauseSpecific: FeaturePropertyString;
      FireDiscoveryDateTime: FeaturePropertyNumber;
      FireOutDateTime: FeaturePropertyNumber;
      FireStrategyConfinePercent: FeaturePropertyNumber;
      FireStrategyFullSuppPercent: FeaturePropertyNumber;
      FireStrategyMonitorPercent: FeaturePropertyNumber;
      FireStrategyPointZonePercent: FeaturePropertyNumber;
      IncidentComplexityLevel: FeaturePropertyString;
      IncidentManagementOrganization: FeaturePropertyString;
      IncidentName: FeaturePropertyString;
      IncidentSize: FeaturePropertyNumber;
      IncidentTypeCategory: FeaturePropertyString;
      ModifiedOnDateTime_dt: FeaturePropertyNumber;
      OBJECTID: FeaturePropertyNumber;
      OrganizationalAssessment: FeaturePropertyString;
      PercentContained: FeaturePropertyNumber;
      PredominantFuelGroup: FeaturePropertyString;
      PredominantFuelModel: FeaturePropertyString;
      PrimaryFuelModel: FeaturePropertyString;
      SecondaryFuelModel: FeaturePropertyString;
      TotalIncidentPersonnel: FeaturePropertyNumber;
    };
  }[];
  updated: string;
}

export interface FireBoundaryInfo {
  activeBoundaries: {
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: {
      poly_IncidentName: FeaturePropertyString;
      attr_CpxName: FeaturePropertyString;
    };
  }[];
  updated: string;
}

/**
 * @deprecated The method should not be used
 */
export interface WeatherResultJson {
  readiness: {
    [key: string]: number;
  };
  updated: string;
}
