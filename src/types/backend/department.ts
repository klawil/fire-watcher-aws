import {
  PagingTalkgroup, UserDepartment
} from '@/types/api/users';

export const validPhoneNumberAccounts = [
  'Baca',
  'NSCAD',
  'Crestone',
  'Saguache',
] as const;
export type PhoneNumberAccount = typeof validPhoneNumberAccounts[number];

export type TwilioAccounts = '' | PhoneNumberAccount;
export type TwilioNumberTypes = 'page' | 'alert' | 'chat';

export type PhoneNumberTypes = `${TwilioNumberTypes}${TwilioAccounts}`;

export const departmentConfig: {
  [key in UserDepartment]: {
    name: string;
    shortName: string;
    defaultTalkgroups: PagingTalkgroup[];
    type: 'text' | 'page';
    pagePhone: PhoneNumberTypes;
    textPhone?: PhoneNumberTypes;
  };
} = {
  Crestone: {
    name: 'Crestone Volunteer Fire Department',
    shortName: 'Crestone',
    type: 'text',
    defaultTalkgroups: [ 8332, ],
    pagePhone: 'page',
    textPhone: 'chatCrestone',
  },
  Baca: {
    name: 'Baca Grande Fire/EMS',
    shortName: 'Baca',
    type: 'page',
    defaultTalkgroups: [ 18331, ],
    pagePhone: 'pageBaca',
  },
  NSCAD: {
    name: 'NSCAD',
    shortName: 'NSCAD',
    type: 'text',
    defaultTalkgroups: [ 8198, ],
    pagePhone: 'page',
    textPhone: 'chatNSCAD',
  },
  PageOnly: {
    name: 'Page Only',
    shortName: 'Page Only',
    type: 'page',
    pagePhone: 'page',
    defaultTalkgroups: [],
  },
  Saguache: {
    name: 'Saguache Fire Department',
    shortName: 'Saguache',
    type: 'page',
    pagePhone: 'page',
    defaultTalkgroups: [ 8332, ],
  },
};

export const pagingTalkgroupConfig: {
  [key in PagingTalkgroup]: {
    linkPreset: string;
    partyBeingPaged: string;

    // Used to determine callsigns for on-call persons
    aladtecDepartment?: string[];
    department?: UserDepartment;
  };
} = {
  8198: {
    linkPreset: 'pNSCAD',
    partyBeingPaged: 'NSCAD',
    aladtecDepartment: [ 'NSCAD', ],
    department: 'NSCAD',
  },
  8332: {
    linkPreset: 'pNSCFPD',
    partyBeingPaged: 'NSCFPD',
  },
  18332: {
    linkPreset: 'pNSCFPD',
    partyBeingPaged: 'NSCFPD VHF',
  },
  18331: {
    linkPreset: 'pBGFD%2FBGEMS',
    partyBeingPaged: 'Baca Grand Fire/EMS',
    aladtecDepartment: [
      'Baca Fire',
      'Baca Grande-Crestone Ambulance',
    ],
    department: 'Baca',
  },
  110001: {
    linkPreset: 'tg110001',
    partyBeingPaged: 'Med 9',
  },
  8334: {
    linkPreset: 'tg8334',
    partyBeingPaged: 'Center EMS/Fire',
  },
  8281: {
    linkPreset: 'tg8281',
    partyBeingPaged: 'Mineral EMS/Fire',
  },
  8181: {
    linkPreset: 'pACFE',
    partyBeingPaged: 'Alamosa EMS',
  },
};

export const pagableParties = [
  'Alamosa EMS Secondary',
  'Alamosa EMS',
  'Baca Grand Fire/EMS',
  'Center EMS/Fire',
  'Conejos EMS',
  'Del Norte EMS',
  'Interfacility Transfer',
  'Mineral EMS/Fire',
  'Monte Vista EMS',
  'NSCAD',
  'NSCFPD',
  'South Fork Fire/EMS',
] as const;

export const pagingPartiesConfig: {
  [key in typeof pagableParties[number]]: {
    linkPreset: string;
    aladtecDepartment?: string[];
    department?: UserDepartment;
  };
} = {
  'Alamosa EMS Secondary': {
    linkPreset: 'pACFE',
  },
  'Alamosa EMS': {
    linkPreset: 'pACFE',
  },
  'Baca Grand Fire/EMS': {
    linkPreset: 'pBGFD%2FBGEMS',
    aladtecDepartment: [
      'Baca Fire',
      'Baca Grande-Crestone Ambulance',
    ],
    department: 'Baca',
  },
  'Center EMS/Fire': {
    linkPreset: 'tg8334',
  },
  'Conejos EMS': {
    linkPreset: 'tg110001',
  },
  'Del Norte EMS': {
    linkPreset: 'tg110001',
  },
  'Interfacility Transfer': {
    linkPreset: 'tg110001',
  },
  'Mineral EMS/Fire': {
    linkPreset: 'tg8281',
  },
  'Monte Vista EMS': {
    linkPreset: 'tg110001',
  },
  'NSCAD': {
    linkPreset: 'pNSCAD',
    aladtecDepartment: [ 'NSCAD', ],
    department: 'NSCAD',
  },
  'NSCFPD': {
    linkPreset: 'pNSCFPD',
  },
  'South Fork Fire/EMS': {
    linkPreset: 'tg110001',
  },
};

export const pagingConfigs: {
  talkgroup: number;
  codes?: string[];
  partyBeingPaged: typeof pagableParties[number];
}[] = [
  {
    talkgroup: 8181,
    partyBeingPaged: 'Alamosa EMS',
  },
  {
    talkgroup: 8198,
    partyBeingPaged: 'NSCAD',
  },
  {
    talkgroup: 8281,
    partyBeingPaged: 'Mineral EMS/Fire',
  },
  {
    talkgroup: 8332,
    partyBeingPaged: 'NSCFPD',
  },
  {
    talkgroup: 8334,
    partyBeingPaged: 'Center EMS/Fire',
  },
  {
    talkgroup: 18331,
    partyBeingPaged: 'Baca Grand Fire/EMS',
  },
  {
    talkgroup: 18332,
    partyBeingPaged: 'NSCFPD',
  },
  {
    talkgroup: 110001,
    codes: [ 'B448', ],
    partyBeingPaged: 'Conejos EMS',
  },
  {
    talkgroup: 110001,
    codes: [ 'B648', ],
    partyBeingPaged: 'Monte Vista EMS',
  },
  {
    talkgroup: 110001,
    codes: [ 'C448', ],
    partyBeingPaged: 'Baca Grand Fire/EMS',
  },
  {
    talkgroup: 110001,
    codes: [ 'J748', ],
    partyBeingPaged: 'Del Norte EMS',
  },
  {
    talkgroup: 110001,
    codes: [ 'J848', ],
    partyBeingPaged: 'South Fork Fire/EMS',
  },
  {
    talkgroup: 110001,
    codes: [ 'D850', ],
    partyBeingPaged: 'Interfacility Transfer',
  },
  {
    talkgroup: 110001,
    codes: [ 'B149', ],
    partyBeingPaged: 'Alamosa EMS Secondary',
  },
];

export const qc2ToDeptMap: {
  [key: string]: string;
} = {
  B448: 'Conejos EMS',
  B648: 'Monte Vista EMS',
  C448: 'Baca Grand Fire/EMS',
  D850: 'Interfacility Transfer',
  J748: 'Del Norte EMS',
  J848: 'South Fork Fire/EMS',
  B149: 'Alamosa EMS Secondary',
};
