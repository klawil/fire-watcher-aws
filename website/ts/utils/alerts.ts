import { Alert } from 'bootstrap';

const alertContainer = document.getElementById('alert-container');

type AlertType = 'success' | 'danger';

export function showAlert(type: AlertType, message: string, timeout: number = 5000) {
	const elem = document.createElement('div');
	alertContainer.appendChild(elem);
	elem.classList.add('alert', `alert-${type}`, 'alert-dismissible', 'alert-fixed', 'fade', 'show');
	elem.innerHTML = `${message} `;

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.classList.add('btn-close');
	closeBtn.setAttribute('data-bs-dismiss', 'alert');
	closeBtn.setAttribute('aria-label', 'Close');
	elem.appendChild(closeBtn);

	const alert = new Alert(elem);
	if (timeout) {
		setTimeout(() => alert.close(), timeout);
	}
}
