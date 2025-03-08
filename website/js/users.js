window.afterAuth = window.afterAuth || [];

const possibleDepartments = [
	'Crestone',
	'Moffat',
	'Saguache',
	'Villa Grove',
	'Baca',
	'NSCAD',
	'Center'
];

const pageNames = {
	'8332': 'NSCFPD DTR',
	'18332': 'NSCFPD VHF',
	'18331': 'Baca',
	'8334': 'Center',
	'8198': 'NSCAD'
};

const defaultTalkgroups = {
	default: [ '8332' ],
	Baca: [ '18331' ],
	Center: [ '8334' ],
	NSCAD: [ '8198' ]
};

const tbody = document.getElementById('tbody');
const modalItems = {
	name: document.getElementById('deleteUser'),
	button: document.getElementById('deleteConfirm')
};

const columns = [
	{
		name: 'phone',
		val: user => formatPhone(user.phone),
		iVal: user => user.phone,
		format: formatPhone,
		classList: [ 'text-center' ],
		class: [ 'form-control' ],
		default: 'Phone Number',
		maxwidth: '100px',
		noEdit: true
	},
	{
		name: 'fName',
		val: user => user.fName || '',
		tdClass: [ 'ps-3' ],
		class: [ 'form-control' ],
		default: 'First Name'
	},
	{
		name: 'lName',
		val: user => user.lName || '',
		tdClass: [ 'ps-3' ],
		class: [ 'form-control' ],
		default: 'Last Name'
	},
	{
		name: 'department',
		type: 'department',
		val: user => user.department || '',
		districtAdmin: true
	},
	{
		name: 'callSign',
		val: user => user.callSign.toString(),
		classList: [ 'text-center' ],
		class: [ 'form-control' ],
		default: 'Callsign',
		maxWidth: '75px'
	},
	{
		name: 'isActive',
		type: 'checkbox',
		val: user => user.isActive || false,
		class: [ 'form-check-input' ]
	},
	{
		name: 'isAdmin',
		type: 'checkbox',
		val: user => user.isAdmin || false,
		class: [ 'form-check-input' ]
	},
	{
		name: 'pageOnly',
		type: 'checkbox',
		val: user => user.pageOnly || false,
		class: [ 'form-check-input' ],
		districtAdmin: true
	},
	{
		name: 'getTranscript',
		type: 'checkbox',
		val: user => user.getTranscript || false,
		class: [ 'form-check-input' ],
		districtAdmin: true
	},
	{
		name: 'getSystemAlerts',
		type: 'checkbox',
		val: user => user.getSystemAlerts || false,
		class: [ 'form-check-input' ],
		districtAdmin: true
	},
	{
		name: 'talkgroups',
		type: 'talkgroups',
		val: user => user.talkgroups || []
	},
	{
		type: 'button',
		class: [ 'btn', 'btn-success' ],
		value: 'Create'
	}
];

function getDepartmentSelect(defaultValue) {
	const select = document.createElement('select');
	select.classList.add('form-select');
	select.name = 'department';
	possibleDepartments.forEach(value => {
		const option = document.createElement('option');
		option.value = value;
		option.innerHTML = value;
		if (value === defaultValue)
			option.selected = true;
		select.appendChild(option);
	});

	return select;
}

function getTalkgroupSelect(defaultValues) {
	const inputs = [];
	let isInvalid = false;

	const container = document.createElement('div');
	container.classList.add('input');
	container.value = defaultValues.map(v => `${v}`);
	container.name = 'talkgroups';
	new MutationObserver(() => {
		let newIsInvalid = container.classList.contains('is-invalid');
		if (newIsInvalid && !isInvalid) {
			inputs.forEach(i => i.classList.add('is-invalid'));
		} else if (!newIsInvalid && isInvalid) {
			inputs.forEach(i => i.classList.remove('is-invalid'));
		}
		isInvalid = newIsInvalid;
	}).observe(container, { attributes: true });
	const randomness = Math.round(Math.random() * 100000).toString();
	for (let key in pageNames) {
		const div = document.createElement('div');
		div.classList.add('form-check');
		container.appendChild(div);

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.id = `talkgroups-${key}-${randomness}`;
		input.value = key;
		input.classList.add('form-check-input');
		input.reset = () => {};
		input.addEventListener('change', () => {
			container.changeFunc();
			if (input.checked && container.value.indexOf(key) === -1) {
				container.value.push(key);
			} else if (!input.checked && container.value.indexOf(key) !== -1) {
				container.value = container.value.filter(v => v !== key);
			}
		});
		if (container.value.indexOf(key) !== -1)
			input.checked = true;
		inputs.push(input);
		div.appendChild(input);

		const label = document.createElement('label');
		label.classList.add('form-check-label');
		label.innerHTML = `${pageNames[key]}`;
		label.setAttribute('for', `talkgroups-${key}-${randomness}`);
		div.appendChild(label);
	}

	return container;
}

function formatPhone(phone) {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}

function addRow(user) {
	user.isAdmin = user.isAdmin || false;
	user.isActive = user.isActive || false;

	const tr = document.createElement('tr');
	tr.user = user;
	let button;

	columns.forEach(value => {
		const td = document.createElement('td');
		td.classList.add('align-middle');
		if (value.districtAdmin) {
			td.classList.add('districtAdmin');
		}
		if (value.tdClass)
			td.classList.add.apply(td.classList, value.tdClass);
		if (value.type === 'checkbox') {
			td.classList.add('text-center');
			const div = document.createElement('div');
			div.classList.add('form-switch');
			td.appendChild(div);
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.name = value.name;
			input.classList.add('form-check-input');
			input.role = 'switch';
			input.addEventListener('change', () => button.disabled = false);
			if (value.val(user)) input.checked = true;
			div.appendChild(input);
			input.reset = () => {};
		} else if (value.type === 'button') {
			td.classList.add('text-center');
			button = document.createElement('button');
			button.classList.add('btn', 'btn-success');
			button.innerHTML = 'Save';
			button.disabled = true;
			button.addEventListener('click', () => {
				button.disabled = true;
				button.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
				button.classList.add('btn-secondary');
				const user = {};
				const inputs = [
					...tr.querySelectorAll('input'),
					...tr.querySelectorAll('select'),
					...tr.querySelectorAll('.input')
				];
				inputs.forEach(input => input.classList.remove('is-invalid'));
				inputs.forEach(input => user[input.name] = input.type === 'checkbox'
					? input.checked
					: input.value);
				
				fetch(`${baseHost}/api/user?action=update`, {
					method: 'POST',
					body: JSON.stringify(user)
				})
					.then(r => r.json())
					.then(data => {
						button.blur();
						if (data.success) {
							inputs.forEach(input => input.reset());
							button.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
							button.classList.add('btn-success');
						} else {
							button.disabled = false;
							button.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
							button.classList.add('btn-danger');
							data.errors = data.errors || inputs.map(i => i.name);
							inputs
								.filter(input => data.errors.indexOf(input.name) !== -1)
								.forEach(input => input.classList.add('is-invalid'));
						}
					});
			});
			td.appendChild(button);

			const deleteButton = document.createElement('button');
			deleteButton.classList.add('btn', 'btn-danger', 'ms-1');
			deleteButton.innerHTML = 'Delete';
			deleteButton.setAttribute('data-bs-toggle', 'modal');
			deleteButton.setAttribute('data-bs-target', '#delete-modal');
			deleteButton.addEventListener('click', () => {
				deleteButton.blur();

				modalItems.name.innerHTML = `${user.fName} ${user.lName}`;
				const newButton = modalItems.button.cloneNode(true);
				modalItems.button.parentElement.replaceChild(newButton, modalItems.button);
				modalItems.button = newButton;

				newButton.addEventListener('click', () => {
					deleteButton.classList.remove('btn-danger', 'btn-secondary');
					deleteButton.classList.add('btn-secondary');
					deleteButton.blur();

					fetch(`${baseHost}/api/user?action=delete`, {
						method: 'POST',
						body: JSON.stringify({
							phone: user.phone.toString()
						})
					})
						.then(r => r.json())
						.then(data => {
							if (data.success) {
								tr.parentElement.removeChild(tr);
							} else {
								deleteButton.blur();
								deleteButton.classList.remove('btn-danger', 'btn-secondary');
								deleteButton.classList.add('btn-danger');
							}
						});
				});
			});
			td.appendChild(deleteButton);
		} else if (value.type === 'department') {
			const input = getDepartmentSelect(value.val(user));
			input.reset = () => {};
			input.addEventListener('change', () => button.disabled = false);
			td.appendChild(input);
		} else if (value.type === 'talkgroups') {
			const input = getTalkgroupSelect(value.val(user));
			input.reset = () => {};
			input.changeFunc = () => button.disabled = false;
			td.appendChild(input);
		} else {
			const span = document.createElement('span');
			span.innerHTML = value.val(user);
			if (value.classList)
				td.classList.add.apply(td.classList, value.classList);
			td.appendChild(span);

			const input = document.createElement('input');
			input.type = 'text';
			input.name = value.name;
			input.classList.add('form-control', 'd-none');
			input.value = typeof value.iVal !== 'undefined'
				? value.iVal(user) || value.val(user)
				: value.val(user);
			input.reset = () => {
				span.innerHTML = value.format
					? value.format(input.value)
					: input.value;
				span.classList.remove('d-none');
				input.classList.add('d-none');
			};

			if (!value.noEdit) {
				let listenerRun = false;
				td.addEventListener('click', () => {
					if (listenerRun) return;
					listenerRun = true;

					button.disabled = false;
					input.classList.remove('d-none');
					span.classList.add('d-none');
					input.focus();
				});
			}
			td.appendChild(input);
		}

		tr.appendChild(td);
	});

	tbody.appendChild(tr);
}

function init() {
	if (user.isDistrictAdmin)
		document.getElementById('customStyles').innerHTML = '';

	fetch(`${baseHost}/api/user?action=list`)
		.then(r => r.json())
		.then(data => {
			if (data.success) {
				data.users
					.sort((a, b) => {
						if (a.lName === b.lName)
							return a.fName > b.fName ? 1 : -1;

						return a.lName > b.lName ? 1 : -1;
					})
					.map(addRow);
			
				const tr = document.createElement('tr');
				columns.forEach(item => {
					const td = document.createElement('td');
					td.classList.add('text-center', 'align-middle');
					if (item.districtAdmin)
						td.classList.add('districtAdmin');
					
					if (item.type === 'department') {
						const input = getDepartmentSelect(user.department);
						td.appendChild(input);
					} else if (item.type === 'talkgroups') {
						const input = getTalkgroupSelect(defaultTalkgroups[user.department] || defaultTalkgroups.default);
						input.reset = () => {};
						input.changeFunc = () => {};
						td.appendChild(input);
					} else {
						const input = document.createElement('input');
						input.classList.add.apply(input.classList, item.class);
						input.type = item.type;
						input.name = item.name;
						if (item.value)
							input.value = item.value;
						if (item.default)
							input.placeholder = item.default;
						if (item.maxwidth)
							td.style.maxWidth = item.maxwidth;
						if (item.type === 'checkbox') {
							const div = document.createElement('div');
							div.classList.add('form-switch');
							div.appendChild(input);
							td.appendChild(div);
						} else {
							td.appendChild(input);
						}

						if (item.type === 'button') {
							input.addEventListener('click', () => {
								input.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
								input.classList.add('btn-secondary');
								const user = {};
								const inputs = [
									...tr.querySelectorAll('input'),
									...tr.querySelectorAll('select'),
									...tr.querySelectorAll('.input')
								];
								inputs.forEach(input => input.classList.remove('is-invalid'));
								inputs
									.forEach(input => user[input.name] = input.type === 'checkbox'
										? input.checked
										: input.value);
								delete user.undefined;

								fetch(`${baseHost}/api/user?action=create`, {
									method: 'POST',
									body: JSON.stringify(user)
								})
									.then(r => r.json())
									.then(data => {
										input.blur();
										if (data.success) {
											input.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
											input.classList.add('btn-success');
											addRow(user);
											tbody.appendChild(tr);
											inputs.forEach(input => input.type === 'checkbox'
												? input.checked = false
												: input.type === 'text'
													? input.value = ''
													: '');
										} else {
											input.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
											input.classList.add('btn-danger');
											data.errors = data.errors || inputs.map(i => i.name);
											inputs
												.filter(input => data.errors.indexOf(input.name) !== -1)
												.forEach(input => input.classList.add('is-invalid'))
										}
									});
							});
						}
					}
					tr.appendChild(td);
				});
				tbody.appendChild(tr);
			}
		});
}

let lastSort = 'lName,fName';
let currentSortIndex = 0;
function sortRows(keysString) {
	const keys = keysString.split(',');
	const numPossibilities = Math.pow(2, keys.length);

	if (lastSort === keysString) {
		currentSortIndex++;
		if (currentSortIndex === numPossibilities)
			currentSortIndex = 0;
	} else {
		currentSortIndex = 0;
	}
	lastSort = keysString;
	let sortRemainder = currentSortIndex;
	const direction = keys
		.map((key, index) => {
			const power = Math.pow(2, keys.length - index - 1);
			const isGreater = sortRemainder >= power;
			if (isGreater)
				sortRemainder -= power;
			return isGreater;
		})
		.reverse();

	const rows = [ ...tbody.getElementsByTagName('tr') ];
	
	const rowsToSort = rows.filter(row => row.user);
	const rowsToKeep = rows.filter(row => !row.user);

	rowsToSort
		.sort((a, b) => {
			let i = 0;
			while (i < keys.length && a.user[keys[i]] === b.user[keys[i]]) {
				i++;
			}

			let aGreater = 1;
			let aLesser = -1;
			if (direction[i]) {
				aGreater = -1;
				aLesser = 1;
			}

			if (i === keys.length) {
				return aGreater;
			}
			let key = keys[i];

			return a.user[key] > b.user[key]
				? aGreater
				: aLesser;
		})
		.forEach(row => tbody.appendChild(row));
	rowsToKeep.forEach(row => tbody.appendChild(row));
}

window.afterAuth.push(init);

[ ...document.querySelectorAll('.sortLabel') ]
	.forEach(label => label.addEventListener('click', () =>
		sortRows(label.getAttribute('data-keys'))));
