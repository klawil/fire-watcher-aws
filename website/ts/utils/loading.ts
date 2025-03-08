export function doneLoading() {
	const spinnerDiv = document.getElementById('loadingCircle');
	const contentDiv = document.getElementById('pageContent');

	if (spinnerDiv.parentElement === null) return;

	spinnerDiv.parentElement.removeChild(spinnerDiv);
	contentDiv.hidden = false;
}
