const phoneInput = document.getElementById('phone');
const codeInput = document.getElementById('code');
const phoneContainer = document.getElementById('phone-container');
const codeContainer = document.getElementById('code-container');
const alertContainer = document.getElementById('alert-container');
const submitButton = document.getElementById('submit');

phoneInput.addEventListener('keyup', () => {
	const input = phoneInput.value.replace(/\D/g, '');
	const first = input.substring(0, 3);
	const middle = input.substring(3, 6);
	const last = input.substring(6, 10);

	if (input.length > 5) phoneInput.value = `${first}-${middle}-${last}`;
	else if (input.length > 2) phoneInput.value = `${first}-${middle}`;
	else phoneInput.value = `${first}`;
});

const searchParams = location.search
	.slice(1)
	.split('&')
	.filter(v => v !== '')
	.map(v => v.split('=').map(v => decodeURIComponent(v)))
	.reduce((agg, row) => ({ ...agg, [row[0]]: row[1] }), {});

let stage = 1;
function submitHandler() {
	phoneInput.classList.remove('is-invalid');
	codeInput.classList.remove('is-invalid');

	let url = `/api?action=`;
	let body = {};
	if (stage === 1) {
		url += `login`;
		body.phone = phoneInput.value.replace(/\D/g, '');
	} else if (stage === 2) {
		url += `auth`;
		body.code = codeInput.value.replace(/\D/g, '');
	}
	let localStage = stage;

	fetch(url, {
		method: 'POST',
		body: JSON.stringify(body)
	})
		.then(r => r.json())
		.then(data => {
			if (!data.success) {
				console.log(data);
				data.errors.forEach(err => {
					const elem = document.getElementById(err);
					if (elem) elem.classList.add('is-invalid');
				});
				return;
			}

			stage = localStage + 1;
			if (stage === 2) {
				codeContainer.classList.remove('d-none');
			} else if (stage === 3) {
				showAlert('success', 'You are now logged in');
				redirectToPage();
			}
		})
		.catch(e => {
			console.error(e);
			showAlert('danger', 'Something went wrong');
		});
}
submitButton.addEventListener('click', submitHandler);
document.addEventListener('keyup', e => {
	if (e.key === 'Enter') submitHandler();
});

function showAlert(type, message) {
	const elem = document.createElement('div');
	elem.classList.add('alert', `alert-${type}`, 'alert-dismissible', 'fade', 'show');
	elem.innerHTML = `${message} <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
	alertContainer.appendChild(elem);
}

function redirectToPage() {
	let newLocation = '/';
	if (typeof searchParams.redirectTo !== 'undefined') {
		newLocation = searchParams.redirectTo;
	}

	window.location = newLocation;
}

window.afterAuth = window.afterAuth || [];
window.afterAuth.push(() => {
	if (window.user.isUser) {
		redirectToPage();
	}
});
