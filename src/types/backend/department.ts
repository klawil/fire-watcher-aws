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
    name: 'Baca Emergency Services',
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
    partyBeingPaged: 'BGES',
    aladtecDepartment: [
      'Baca Fire',
      'Baca Grande-Crestone Ambulance',
    ],
    department: 'Baca',
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
