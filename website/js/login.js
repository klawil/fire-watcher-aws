const phoneInput = document.getElementById('phone');
const codeInput = document.getElementById('code');
const phoneContainer = document.getElementById('phone-container');
const codeContainer = document.getElementById('code-container');
const alertContainer = document.getElementById('alert-container');
const submitButton = document.getElementById('submit');
const fidoButton = document.getElementById('use-token');

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
let fidoKeys = [];
function submitHandler() {
	phoneInput.classList.remove('is-invalid');
	codeInput.classList.remove('is-invalid');

	let url = `/api/user?action=`;
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

			if (
				stage === 1 &&
				typeof data.data !== 'undefined' &&
				data.data.length > 0 &&
				window.PublicKeyCredential
			) {
				fidoKeys = data.data;
				fidoButton.hidden = false;
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

const bufferToBase64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const base64ToBuffer = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
fidoButton.addEventListener('click', async () => {
	if (fidoKeys.length === 0) return;

	const challenge = await fetch(`/api/user?action=fido-get-auth`).then(r => r.json());
	challenge.challenge = new Uint8Array(challenge.challenge.data);
	challenge.allowCredentials = fidoKeys.map(keyId => ({
		id: base64ToBuffer(keyId),
		type: 'public-key',
		transports: ['internal'],
	}));

	const credential = await navigator.credentials.get({
		publicKey: challenge,
	});

	const data = {
		rawId: bufferToBase64(credential.rawId),
		challenge: bufferToBase64(challenge.challenge),
		phone: phoneInput.value.replace(/\D/g, ''),
		response: {
			authenticatorData: bufferToBase64(credential.response.authenticatorData),
			signature: bufferToBase64(credential.response.signature),
			userHandle: bufferToBase64(credential.response.userHandle),
			clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
			id: credential.id,
			type: credential.type,
		},
	};
	const result = await fetch(`/api/user?action=fido-auth`, {
		method: 'POST',
		body: JSON.stringify(data),
	}).then(r => r.json());
	if (result.success) {
		showAlert('success', 'You are now logged in');
		redirectToPage();
	}
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
	} else {
		doneLoading();
	}
});
