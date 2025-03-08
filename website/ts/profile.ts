// import { ApiUserFidoChallengeResponse, ApiUserFidoRegisterBody, ApiUserFidoRegisterResponse, ApiUserGetUserResponse, ApiUserUpdateBody, ApiUserUpdateResponse } from '../../common/userApi';
// import { afterAuthUpdate, base64ToBuffer, bufferToBase64, useFidoKey, user } from './utils/auth';
import { ApiUserGetUserResponse, ApiUserUpdateBody, ApiUserUpdateResponse } from '../../common/userApi';
import { afterAuthUpdate, user } from './utils/auth';
import { PagingTalkgroup, pagingConfig, pagingTalkgroupOrder, validDepartments } from '../../common/userConstants';
import { formatPhone } from './utils/userConstants';
import { doneLoading } from './utils/loading';
import { showAlert } from './utils/alerts';
import { createTableRow } from './utils/table';
import { getLogger } from '../../stack/resources/utils/logger';

const logger = getLogger('profile');

const fieldsToFill: (keyof ApiUserGetUserResponse)[] = [
	'phone',
	'fName',
	'lName',
];

function formatValue(value: string | boolean | number): string {
	logger.trace('formatValue', ...arguments);
	if (
		typeof value === 'number' ||
		(
			typeof value === 'string' &&
			/^[0-9]{10}$/.test(value)
		)
	) {
		return formatPhone(value);
	}

	if (typeof value === 'boolean') {
		return `<i class="bi bi-${value ? 'check-circle-fill text-success' : 'x-circle-fill text-danger'}">`;
	}

	return value;
}

function makePageCheckbox(container: HTMLElement, key: PagingTalkgroup) {
	logger.trace('makePageCheckbox', ...arguments);
	const div = document.createElement('div');
	div.classList.add('form-check', 'form-switch');
	container.appendChild(div);

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('role', 'switch');
	input.id = `talkgroups-${key}`;
	input.value = key.toString();
	input.classList.add('form-check-input', 'talkgroup', 'update-input');
	if (user.talkgroups?.indexOf(key) !== -1)
		input.checked = true;
	div.appendChild(input);

	const label = document.createElement('label');
	label.classList.add('form-check-label');
	label.innerHTML = `${pagingConfig[key].partyBeingPaged}`;
	label.setAttribute('for', input.id);
	div.appendChild(label);
}

const updateUserButton = <HTMLButtonElement>document.getElementById('submit-button');
updateUserButton.disabled = true;
async function updateUser() {
	logger.trace('updateUser', ...arguments);
	updateUserButton.classList.remove('btn-success', 'btn-secondary', 'btn-danger');
	updateUserButton.classList.add('btn-secondary');
	updateUserButton.disabled = true;

	Array.from(document.querySelectorAll('.update-input'))
		.forEach(elem => elem.classList.remove('is-invalid'));

	if (typeof user.phone === 'undefined') return;

	const userBody: ApiUserUpdateBody = {
		isMe: true,
		phone: user.phone.toString(),
		fName: (<HTMLInputElement>document.getElementById('fName')).value,
		lName: (<HTMLInputElement>document.getElementById('lName')).value,
		talkgroups: Array.from(<NodeListOf<HTMLInputElement>>document.querySelectorAll('.talkgroup'))
			.filter(v => v.checked)
			.map(v => parseInt(v.value, 10)),
	};

	const result: ApiUserUpdateResponse = await fetch(`/api/user?action=update`, {
		method: 'POST',
		body: JSON.stringify(userBody),
	})
		.then(r => r.json());
	updateUserButton.blur();

	updateUserButton.classList.remove('btn-success', 'btn-secondary', 'btn-danger');
	if (result.success)
		updateUserButton.classList.add('btn-success');
	else {
		updateUserButton.classList.add('btn-danger');
		if (result.errors && result.errors.length > 0) {
			result.errors.forEach(key => {
				if (key === 'talkgroups') {
					Array.from(document.querySelectorAll('.talkgroup'))
						.forEach(elem => elem.classList.add('is-invalid'));
				} else {
					const elem = document.getElementById(key);
					if (elem === null) return;
					elem.classList.add('is-invalid');
				}
			});
		} else {
			if (result.message) {
				showAlert('danger', result.message);
			}
			Array.from(document.querySelectorAll('.update-input'))
				.forEach(elem => elem.classList.add('is-invalid'));
		}
	}

	updateUserButton.disabled = false;
}

// async function testFidoKey(btn: HTMLButtonElement, key: string) {
// 	logger.trace('testFidoKey', ...arguments);
// 	btn.disabled = true;
// 	btn.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
// 	btn.classList.add('btn-secondary');
// 	if (typeof user.fidoKeyIds === 'undefined' || typeof user.fidoKeyIds[key] === 'undefined') return;

// 	await useFidoKey([ user.fidoKeyIds[key] ], true);

// 	btn.disabled = false;
// 	btn.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
// 	btn.classList.add('btn-success');
// }

// const addFidoButton = <HTMLButtonElement>document.getElementById('add-fido-button');
// const addFidoKeyName = <HTMLInputElement>document.getElementById('fidoName');
// async function addFidoKey() {
// 	logger.trace('addFidoKey', ...arguments);
// 	if (addFidoKeyName.value === '') {
// 		showAlert('danger', 'A name is required to add a Fido key');
// 		return;
// 	}
// 	const newName = addFidoKeyName.value;
// 	addFidoButton.classList.remove('btn-success', 'btn-danger', 'btn-secondary');
// 	addFidoButton.classList.add('btn-secondary');
// 	addFidoButton.disabled = true;

// 	let result: ApiUserFidoRegisterResponse = {
// 		success: false,
// 		message: 'Unknown failure',
// 	};
// 	try {
// 		// Get the attestation
// 		const attestationOptions: ApiUserFidoChallengeResponse = await fetch(`/api/user?action=fido-challenge`, {
// 			method: 'POST',
// 			body: JSON.stringify({ name: newName }),
// 		}).then(r => r.json());
// 		const credential = (await navigator.credentials.create({
// 			publicKey: {
// 				...attestationOptions.options,
// 				challenge: base64ToBuffer(attestationOptions.options.challenge),
// 				user: {
// 					...attestationOptions.options.user,
// 					id: base64ToBuffer(attestationOptions.options.user.id),
// 				}
// 			},
// 		})) as PublicKeyCredential & {
// 			response: AuthenticatorAttestationResponse;
// 		};
// 		const credentialId = bufferToBase64(credential.rawId);

// 		const registerCredentialBody: ApiUserFidoRegisterBody = {
// 			challenge: attestationOptions.options.challenge,
// 			name: newName,
// 			userId: attestationOptions.options.user.id,
// 			credential: {
// 				rawId: credentialId,
// 				response: {
// 					attestationObject: bufferToBase64(credential.response.attestationObject),
// 					clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
// 				}
// 			}
// 		};
// 		result = await fetch(`/api/user?action=fido-register`, {
// 			method: 'POST',
// 			body: JSON.stringify(registerCredentialBody),
// 		}).then(r => r.json());
// 	} catch (e) {
// 		logger.error('addFidoKey', e);
// 		result.message = (<Error>e).message;
// 	}

// 	const alertMessage = `New Key Registration: ${result.success ? 'Success!' : `Failed - ${result.message}`}`;
// 	showAlert(result.success ? 'success' : 'danger', alertMessage);

// 	addFidoButton.classList.remove('btn-success', 'btn-danger', 'btn-secondary');
// 	addFidoButton.classList.add('btn-success');
// 	addFidoButton.disabled = false;
// }
// addFidoButton.addEventListener('click', addFidoKey);

function init() {
	logger.trace('init', ...arguments);
	fieldsToFill.forEach(key => {
		const elem = <HTMLInputElement>document.getElementById(key);
		if (elem === null) return;

		if (typeof elem.value !== 'undefined') {
			elem.value = formatValue(user[key] as string | boolean | number);
		} else {
			elem.innerHTML = formatValue(user[key] as string | boolean | number);
		}
	});

	const departmentContainer = document.getElementById('department');
	if (departmentContainer !== null) {
		validDepartments.forEach(dep => {
			const depConf = user[dep];
			if (typeof depConf === 'undefined') return;

			createTableRow(departmentContainer, {
				classList: [ 'text-center', 'align-middle', ],
				columns: [
					{ html: dep, },
					{ html: formatValue(depConf.active as boolean), },
					{ html: formatValue(depConf.callSign as string), },
					{ html: formatValue(depConf.admin as boolean), },
				],
			});
		});
	}

	const pageGroupContainer = document.getElementById('talkgroups');
	if (pageGroupContainer !== null)
		pagingTalkgroupOrder.forEach(key => makePageCheckbox(pageGroupContainer, key));

	// const fidoRow = <HTMLTableRowElement>document.getElementById('create-fido-row');
	// Object.keys(user.fidoKeyIds || {}).forEach(key => {
	// 	const tr = createTableRow(null, {
	// 		columns: [
	// 			{
	// 				html: key
	// 			},
	// 			{
	// 				create: td => {
	// 					if (window.PublicKeyCredential) {
	// 						const testBtn = document.createElement('button');
	// 						td.appendChild(testBtn);
	// 						testBtn.classList.add('btn', 'btn-success');
	// 						testBtn.innerHTML = 'Test';
	// 						testBtn.addEventListener('click', testFidoKey.bind(null, testBtn, key));
	// 					}
	// 					const deleteBtn = document.createElement('button');
	// 					td.appendChild(deleteBtn);
	// 					deleteBtn.classList.add('btn', 'btn-danger', 'ms-3');
	// 					deleteBtn.innerHTML = 'Delete';
	// 				},
	// 			},
	// 		]
	// 	});
	// 	if (fidoRow.parentElement !== null)
	// 		fidoRow.parentElement.insertBefore(tr, fidoRow);
	// });

	updateUserButton.disabled = false;
	updateUserButton.addEventListener('click', updateUser);

	doneLoading();
}

// if (window.PublicKeyCredential) {
// 	(<HTMLDivElement[]>Array.from(document.getElementsByClassName('hide-no-fido'))).forEach((div) => {
// 		div.hidden = false;
// 	});
// }

afterAuthUpdate.push(init);
