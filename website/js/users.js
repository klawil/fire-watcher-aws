window.afterAuth = window.afterAuth || [];

const tbody = document.getElementById('tbody');
const modalItems = {
	name: document.getElementById('deleteUser'),
	button: document.getElementById('deleteConfirm')
};

function formatPhone(phone) {
	const first = phone.toString().substring(0, 3);
	const middle = phone.toString().substring(3, 6);
	const last = phone.toString().substring(6, 10);

	return `${first}-${middle}-${last}`;
}

function addRow(user) {
	const tr = document.createElement('tr');
	let button;

	[
		{
			val: formatPhone(user.phone),
			format: formatPhone,
			name: 'phone',
			iVal: user.phone,
			classList: [ 'text-center' ],
			noEdit: true
		},
		{
			val: user.fName || '',
			tdClass: [ 'ps-3' ],
			name: 'fName'
		},
		{
			val: user.lName || '',
			tdClass: [ 'ps-3' ],
			name: 'lName'
		},
		{
			val: user.callSign.toString(),
			classList: [ 'text-center' ],
			maxwidth: '75px',
			name: 'callSign'
		},
		{
			val: user.isActive || false,
			name: 'isActive',
			type: 'checkbox'
		},
		{
			val: user.isAdmin || false,
			name: 'isAdmin',
			type: 'checkbox'
		},
		{
			type: 'button'
		}
	]
		.forEach(value => {
			const td = document.createElement('td');
			td.classList.add('align-middle');
			if (value.maxwidth)
				td.style.maxWidth = value.maxwidth;
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
				if (value.val) input.checked = true;
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
					const inputs = [ ...tr.querySelectorAll('input') ];
					inputs.forEach(input => input.classList.remove('is-invalid'));
					inputs.forEach(input => user[input.name] = input.type === 'checkbox'
						? input.checked
						: input.value);
					
					console.log(user);
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
			} else {
				const span = document.createElement('span');
				span.innerHTML = value.val;
				if (value.classList)
					td.classList.add.apply(td.classList, value.classList);
				td.appendChild(span);

				const input = document.createElement('input');
				input.type = 'text';
				input.name = value.name;
				input.classList.add('form-control', 'd-none');
				input.value = value.iVal || value.val;
				input.reset = () => {
					span.innerHTML = value.format
						? value.format(input.value)
						: input.value;
					span.classList.remove('d-none');
					input.classList.add('d-none');
				};
				td.appendChild(input);

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
			}

			tr.appendChild(td);
		});

	tbody.appendChild(tr);
}

function init() {
	fetch(`${baseHost}/api/user?action=list`)
		.then(r => r.json())
		.then(data => {
			if (data.success) {
				data.users.map(addRow);
			
				const tr = document.createElement('tr');
				[
					{
						type: 'text',
						class: [ 'form-control' ],
						name: 'phone',
						default: 'Phone Number',
						maxwidth: '100px'
					},
					{
						type: 'text',
						class: [ 'form-control' ],
						name: 'fName',
						default: 'First Name'
					},
					{
						type: 'text',
						class: [ 'form-control' ],
						name: 'lName',
						default: 'Last Name'
					},
					{
						type: 'text',
						class: [ 'form-control' ],
						name: 'callSign',
						default: 'Callsign',
						maxwidth: '75px'
					},
					{
						type: 'checkbox',
						class: [ 'form-check-input' ],
						name: 'isActive'
					},
					{
						type: 'checkbox',
						class: [ 'form-check-input' ],
						name: 'isAdmin'
					},
					{
						type: 'button',
						value: 'Create',
						class: [ 'btn', 'btn-success' ]
					}
				]
					.forEach(item => {
						const td = document.createElement('td');
						td.classList.add('text-center', 'align-middle');
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
						tr.appendChild(td);

						if (item.type === 'button') {
							input.addEventListener('click', () => {
								input.classList.remove('btn-danger', 'btn-success', 'btn-secondary');
								input.classList.add('btn-secondary');
								const user = {};
								const inputs = [ ...tr.querySelectorAll('input') ];
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
					});
				tbody.appendChild(tr);
			}
		})
		.then(console.log);
}

window.afterAuth.push(init);
