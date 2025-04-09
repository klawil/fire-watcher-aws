const dtrFilenameRegex = /\d{2,5}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
const vhfFilenameRegex = /(SAG|BG)_FIRE_VHF_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp3/;

export function fNameToDate(fName: string): Date {
	const dtrMatch = fName.match(dtrFilenameRegex);
	const vhfMatch = fName.match(vhfFilenameRegex);

	if (dtrMatch !== null) {
		return new Date(parseInt(dtrMatch[1], 10) * 1000);
	} else if (vhfMatch !== null) {
		return new Date(`${vhfMatch[2]}-${vhfMatch[3]}-${vhfMatch[4]}T${vhfMatch[5]}:${vhfMatch[6]}:${vhfMatch[7]}Z`);
	}

	return new Date(0);
}

export function formatPhone(phone: number | string): string {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	if (last !== '') {
		return `${first}-${middle}-${last}`;
	}
	if (middle !== '') {
		return `${first}-${middle}`;
	}
	return first;
}

export function parsePhone(phone: number | string): number {
  return Number(phone.toString().replace(/[^0-9]/g, ''));
}

export function randomString(len: number, numeric = false): string {
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	if (numeric) {
		chars = '0123456789';
	}
	const str: string[] = [];

	for (let i = 0; i < len; i++) {
		str[i] = chars[Math.floor(Math.random() * chars.length)];
	}

	return str.join('');
}

const timeZone = 'America/Denver';

export function dateToTimeString(d: Date): string {
	const dateString = d.toLocaleDateString('en-US', {
		timeZone: timeZone,
		weekday: 'short',
		month: 'short',
		day: '2-digit'
	});
	
	const timeString = d.toLocaleTimeString('en-US', {
		timeZone: timeZone,
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	return `on ${dateString} at ${timeString}`;
}
