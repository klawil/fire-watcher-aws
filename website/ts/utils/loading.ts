const spinnerDiv = document.getElementById('loadingCircle');
const contentDiv = document.getElementById('pageContent');

export function doneLoading() {
	if (spinnerDiv.parentElement === null) return;

	spinnerDiv.parentElement.removeChild(spinnerDiv);
	contentDiv.hidden = false;
}
