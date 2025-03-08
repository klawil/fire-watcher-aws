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
		console.log(user);
	});
}

window.afterAuth.push(() => window.userQueue.push(init));
