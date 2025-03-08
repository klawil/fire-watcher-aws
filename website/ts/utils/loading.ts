import { getLogger } from "../../../common/logger";

const logger = getLogger('loading');

let hasBeenCalled = false;

export function doneLoading() {
	logger.trace('doneLoading');
	if (hasBeenCalled) return;
	logger.debug('doneLoading first call');
	hasBeenCalled = true;

	const spinnerDiv = document.getElementById('loadingCircle');
	const contentDiv = document.getElementById('pageContent');

	if (
		spinnerDiv === null ||
		spinnerDiv.parentElement === null ||
		contentDiv === null ||
		spinnerDiv.parentElement === null
	) return;

	spinnerDiv.parentElement.removeChild(spinnerDiv);
	contentDiv.hidden = false;
}
