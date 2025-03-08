window.afterAuth = window.afterAuth || [];
window.userQueue = window.userQueue || [];

const boolFormat = bool => `<i class="bi bi-${bool ? 'check-circle-fill  text-success' : 'x-circle-fill text-danger'}">`;
const noFormat = str => str;
const staticFields = {
	phone: val => formatPhone(val),
	isActive: boolFormat,
	isAdmin: boolFormat,
	department: noFormat,
	callSign: noFormat
};
const inputFields = {
	fName: noFormat,
	lName: noFormat
};

let userDefaultTgs = [];

function makePageCheckbox(container, key) {
	const div = document.createElement('div');
	div.classList.add('form-check', 'form-switch');
	container.appendChild(div);

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.role = 'switch';
	input.id = `talkgroups-${key}`;
	input.value = key;
	input.classList.add('form-check-input', 'talkgroup');
	if (container.value.indexOf(key) !== -1)
		input.checked = true;
	if (userDefaultTgs.indexOf(key) !== -1)
		input.disabled = true;
	div.appendChild(input);

	const label = document.createElement('label');
	label.classList.add('form-check-label');
	label.innerHTML = `${pageNames[key]}`;
	label.setAttribute('for', input.id);
	div.appendChild(label);
}

function pageGroups() {
	const container = document.getElementById('talkgroups');
	container.value = user.talkgroups;

	talkgroupOrder.forEach(key => makePageCheckbox(container, key));
}

if (window.PublicKeyCredential) {
	[ ...document.getElementsByClassName('hide-no-fido') ].forEach(div => {
		div.hidden = false;
	});
}

const bufferToBase64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const base64ToBuffer = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

function init() {
	userDefaultTgs = defaultTalkgroups[user.department] || defaultTalkgroups.default;

	for (let key in staticFields) {
		const elem = document.getElementById(key);
		if (elem === null) continue;

		elem.innerHTML = staticFields[key](user[key]);
	}

	for (let key in inputFields) {
		const elem = document.getElementById(key);
		if (elem === null) continue;

		elem.value = inputFields[key](user[key]);
	}

	pageGroups();

	const button = document.getElementById('submit-button');
	button.addEventListener('click', () => {
		button.classList.remove('btn-success', 'btn-secondary', 'btn-danger');
		button.classList.add('btn-secondary');

		const user = {
			isMe: true
		};
		user.phone = window.user.phone;

		for (let key in inputFields) {
			user[key] = document.getElementById(key).value;
		}

		user.talkgroups = [ ...document.querySelectorAll('.talkgroup') ]
			.filter(v => v.checked)
			.map(v => v.value);

		fetch(`${baseHost}/api/user?action=update`, {
			method: 'POST',
			body: JSON.stringify(user)
		})
			.then(r => r.json())
			.then(data => {
				button.blur();
				if (data.success) {
					button.classList.remove('btn-success', 'btn-secondary', 'btn-danger');
					button.classList.add('btn-success');
					for (let key in inputFields) {
						document.getElementById(key).classList.remove('is-invalid');
					}
					[ ...document.querySelectorAll('.talkgroup') ]
						.forEach(elem => elem.classList.remove('is-invalid'));
				} else {
					button.classList.remove('btn-success', 'btn-secondary', 'btn-danger');
					button.classList.add('btn-danger');
					data.errors = data.errors || [
						...Object.keys(inputFields),
						'talkgroup'
					];
					for (let key in inputFields) {
						if (data.errors.indexOf(key) === -1) continue;

						document.getElementById(key).classList.add('is-invalid');
					}
					if (data.errors.indexOf('talkgroup') !== -1)
						[ ...document.querySelectorAll('.talkgroup') ]
							.forEach(elem => elem.classList.remove('is-invalid'));
				}
			})
	});

	if (window.PublicKeyCredential) {
		const fidoRow = document.getElementById('create-fido-row');
		Object.keys(user.fidoKeys || {}).forEach(key => {
			const tr = document.createElement('tr');
			const td1 = document.createElement('td');
			tr.appendChild(td1);
			td1.innerHTML = key;

			const td2 = document.createElement('td');
			tr.appendChild(td2);
			const btn2 = document.createElement('button');
			td2.appendChild(btn2);
			btn2.classList.add('btn', 'btn-success');
			btn2.innerHTML = 'Test';
			const btn = document.createElement('button');
			td2.appendChild(btn);
			btn.classList.add('btn', 'btn-danger', 'ms-3');
			btn.innerHTML = 'Delete';

			btn2.addEventListener('click', async () => {
				btn2.enabled = false;
				const challenge = await fetch(`/api/user?action=fido-get-auth`).then(r => r.json());
				challenge.challenge = new Uint8Array(challenge.challenge.data);
				challenge.allowCredentials = [
					{
						id: base64ToBuffer(user.fidoKeys[key]),
						type: 'public-key',
						transports: ['internal'],
					}
				];

				const credential = await navigator.credentials.get({
					publicKey: challenge,
				});

				const data = {
					rawId: bufferToBase64(credential.rawId),
					challenge: bufferToBase64(challenge.challenge),
					test: true,
					response: {
						authenticatorData: bufferToBase64(credential.response.authenticatorData),
						signature: bufferToBase64(credential.response.signature),
						userHandle: bufferToBase64(credential.response.userHandle),
						clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
						id: credential.id,
						type: credential.type
					},
				};
				console.log(data);

				const result = await fetch(`/api/user?action=fido-auth`, {
					method: 'POST',
					body: JSON.stringify(data),
				}).then(r => r.json());
				console.log(result);
				btn2.enabled = true;
			});

			fidoRow.parentElement.insertBefore(tr, fidoRow);
		});

		const fidoButton = document.getElementById('add-fido-button');
		const fidoKeyName = document.getElementById('fidoName');
		async function addFidoKey() {
			if (fidoKeyName.value === '')
				throw new Error('Missing Name');
			const newName = fidoKeyName.value;

			// Get the attestation
			const data = await fetch(`${baseHost}/api/user?action=fido-challenge`, {
				method: 'POST',
				body: JSON.stringify({ name: newName }),
			}).then(r => r.json());
			data.options.challenge = new Uint8Array(data.options.challenge.data);
			data.options.user.name = user.phone;
			data.options.user.id = new Uint8Array(data.options.user.id.data);
			data.options.user.displayName = `${user.fName} ${user.lName}`;

			const credential = await navigator.credentials.create({
				publicKey: data.options,
			});
			const credentialId = bufferToBase64(credential.rawId);

			await fetch(`${baseHost}/api/user?action=fido-register`, {
				method: 'POST',
				body: JSON.stringify({
					challenge: bufferToBase64(data.options.challenge),
					name: newName,
					userId: bufferToBase64(data.options.user.id),
					credential: {
						rawId: credentialId,
						response: {
							attestationObject: bufferToBase64(credential.response.attestationObject),
							clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
						},
					},
				}),
			}).then(r => r.json());

			console.log(newName);
		}
		fidoButton.addEventListener('click', addFidoKey);
		fidoKeyName.addEventListener('keyup', e => {
			if (e.key === 'Enter')
				addFidoKey();
		});
	}

	doneLoading();
}

window.afterAuth.push(() => window.userQueue.push(init));
