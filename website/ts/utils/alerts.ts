const alertContainer = document.getElementById('alert-container');

type AlertType = 'success' | 'danger';

export function showAlert(type: AlertType, message: string) {
	const elem = document.createElement('div');
	elem.classList.add('alert', `alert-${type}`, 'alert-dismissible', 'alert-fixed', 'fade', 'show');
	elem.innerHTML = `${message} <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
	alertContainer.appendChild(elem);
}
