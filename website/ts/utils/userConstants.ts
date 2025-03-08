import { getLogger } from "../../../stack/resources/utils/logger";
const logger = getLogger('uConst');

export function formatPhone(phone: number | string): string {
	logger.trace('formatPhone', ...arguments);

	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}
