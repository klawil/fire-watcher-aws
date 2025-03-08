const dtrFilenameRegex = /\d{4}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
const vhfFilenameRegex = /(SAG|BG)_FIRE_VHF_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp3/;

export function fNameToDate(fName: string): Date {
	const dtrMatch = fName.match(dtrFilenameRegex);
	const vhfMatch = fName.match(vhfFilenameRegex);

	if (dtrMatch !== null) {
		return new Date(parseInt(dtrMatch[1], 10) * 1000);
	} else if (vhfMatch !== null) {
		return new Date(`${vhfMatch[3]}-${vhfMatch[4]}-${vhfMatch[5]}T${vhfMatch[6]}:${vhfMatch[7]}:${vhfMatch[8]}Z`);
	}

	return new Date(0);
}
