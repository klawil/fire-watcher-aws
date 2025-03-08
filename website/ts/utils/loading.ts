let hasBeenCalled = false;

export function doneLoading() {
	if (hasBeenCalled) return;
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
