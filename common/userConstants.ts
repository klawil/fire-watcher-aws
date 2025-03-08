export type UserDepartment = 'Crestone' | 'NSCAD' | 'Baca' | 'PageOnly' | 'Saguache';
export type PagingTalkgroup = 8332 | 18332 | 18331 | 8198 | 8334
 | 8281 | 8181;

interface DepartmentConfig {
	name: string;
	shortName: string;
	defaultTalkgroups: PagingTalkgroup[];
	type: 'text' | 'page';
	pagePhone: string;
	textPhone?: string;
}

interface PageConfig {
	linkPreset: string;
	partyBeingPaged: string;
	pageService: string;
}

export const validDepartments: UserDepartment[] = [
	'Baca',
	'Crestone',
	'NSCAD',
	'PageOnly',
	'Saguache',
];

export type PhoneNumberAccount = 'Baca' | 'NSCAD' | 'Crestone' | 'Saguache';
export const validPhoneNumberAccounts: PhoneNumberAccount[] = [
	'Baca',
	'NSCAD',
	'Crestone',
	'Saguache',
];

export const pagingTalkgroupOrder: PagingTalkgroup[] = [
	8332,
	18332,
	18331,
	8198,
	8334,
	8281,
	8181,
];

export const defaultDepartment = 'Crestone';

type DepartmentConfigBaseType = {
	[key in UserDepartment]?: DepartmentConfig;
}
type DepartmentConfigBaseType2 = {
	[defaultDepartment]: DepartmentConfig;
}

export const departmentConfig: DepartmentConfigBaseType & DepartmentConfigBaseType2 = {
	Crestone: {
		name: 'Crestone Volunteer Fire Department',
		shortName: 'Crestone',
		type: 'text',
		defaultTalkgroups: [ 8332 ],
		pagePhone: 'page',
		textPhone: 'chatCrestone',
	},
	Baca: {
		name: 'Baca Emergency Services',
		shortName: 'Baca',
		type: 'page',
		defaultTalkgroups: [ 18331 ],
		pagePhone: 'pageBaca',
	},
	NSCAD: {
		name: 'NSCAD',
		shortName: 'NSCAD',
		type: 'text',
		defaultTalkgroups: [ 8198 ],
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
		defaultTalkgroups: [ 8332 ],
	},
};

export const pagingConfig: {
	[key in PagingTalkgroup]: PageConfig;
} = {
	8198: {
		linkPreset: 'pNSCAD',
		partyBeingPaged: 'NSCAD',
		pageService: 'AMBO',
	},
	8332: {
		linkPreset: 'pNSCFPD',
		partyBeingPaged: 'NSCFPD',
		pageService: 'FIRE',
	},
	18331: {
		linkPreset: 'pBGFD%2FBGEMS',
		partyBeingPaged: 'BGEMS/BGFD',
		pageService: 'BACA',
	},
	18332: {
		linkPreset: 'pNSCFPD',
		partyBeingPaged: 'NSCFPD VHF',
		pageService: 'FIRE',
	},
	8334: {
		linkPreset: 'tg8334',
		partyBeingPaged: 'Center EMS/Fire',
		pageService: 'CENTER',
	},
	8281: {
		linkPreset: 'tg8281',
		partyBeingPaged: 'Mineral EMS/Fire',
		pageService: 'MINERAL',
	},
	8181: {
		linkPreset: 'pACFE',
		partyBeingPaged: 'Alamosa EMS',
		pageService: 'ALAMOSA EMS',
	},
};
