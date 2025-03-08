export const pageNames: {
	[key: string]: string;
} = {
	'8332': 'NSCFPD DTR',
	'18332': 'NSCFPD VHF',
	'18331': 'Baca',
	'8334': 'Center',
	'8198': 'NSCAD',
	'8281': 'Mineral Co',
	'8181': 'Alamosa EMS',
};

export const talkgroupOrder: string[] = [
	'8332',
	'18332',
	'18331',
	'8198',
	'8334',
	'8281',
	'8181',
];

export const defaultTalkgroups: {
	[key: string]: string[];
} = {
	default: [ '8332' ],
	Baca: [ '18331' ],
	Center: [ '8334' ],
	NSCAD: [ '8198' ],
};

export function formatPhone(phone: number | string): string {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}
