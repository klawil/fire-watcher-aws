const pageNames = {
	'8332': 'NSCFPD DTR',
	'18332': 'NSCFPD VHF',
	'18331': 'Baca',
	'8334': 'Center',
	'8198': 'NSCAD'
};

const talkgroupOrder = [
	'8332',
	'18332',
	'18331',
	'8198',
	'8334'
];

const defaultTalkgroups = {
	default: [ '8332' ],
	Baca: [ '18331' ],
	Center: [ '8334' ],
	NSCAD: [ '8198' ]
};

function formatPhone(phone) {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}

window.userQueue = window.userQueue || []
window.userQueue.forEach(f => f());
window.userQueue.push = f => f();
