import { ApiUserListResponse, ApiUserUpdateBody, ApiUserUpdateGroupBody, ApiUserUpdateResponse, UserObject } from "../../common/userApi";
import { UserDepartment, defaultDepartment, departmentConfig, pagingConfig, pagingTalkgroupOrder, validDepartments } from "../../common/userConstants";
import { showAlert } from "./utils/alerts";
import { user } from "./utils/auth";
import { modifyButton } from "./utils/button";
import { doneLoading } from "./utils/loading";
import { RowConfig, createTableRow } from "./utils/table";
import { formatPhone } from "./utils/userConstants";
import { getLogger } from "../../stack/resources/utils/logger";

const logger = getLogger('users');

interface CheckboxConfig {
	name: keyof ApiUserUpdateBody;
	label: string;
	districtAdmin?: boolean;
	val: (a: UserObject) => boolean;
}

interface InputConfig {
	name: keyof ApiUserUpdateBody;
	placeholder: string;
	val: (u: ApiUserUpdateBody) => string;
	iVal?: (u: ApiUserUpdateBody) => string;
	format?: (a: string) => string;
	maxWidth?: string;
}

const tbody = <HTMLTableSectionElement>document.getElementById('tbody');

const userAdminDepartments: UserDepartment[] = validDepartments
	.filter(dep => user.isDistrictAdmin || (user[dep]?.active && user[dep]?.admin));

function getUserDepartmentRowConfig(u: UserObject, department: UserDepartment): RowConfig {
	logger.trace('getUserDepartmentRowConfig', ...arguments);
	const defaultDepartmentValues = u[department] || {
		active: false,
		callSign: '',
		admin: false,
	};

	let canEditThisDepartment = !!user.isDistrictAdmin || (
		typeof user[department] !== 'undefined' &&
		user[department]?.admin &&
		user[department]?.active
	);

	const changedValues: Partial<UserObject[UserDepartment]> = {};
	const callsignInput: HTMLInputElement = document.createElement('input');
	const saveButton: HTMLButtonElement = document.createElement('button');

	const proxyBase: Partial<UserObject[UserDepartment]> = {};
	const departmentValues = new Proxy(proxyBase, {
		set: (target, prop, value) => {
			if (value === (defaultDepartmentValues as any)[prop]) {
				delete (changedValues as any)[prop];
			} else {
				(changedValues as any)[prop] = value;
			}
			saveButton.disabled = Object.keys(changedValues).length === 0;

			(target as any)[prop] = value;
			return true;
		}
	});

	return {
		id: `${u.phone.toString()}-${department}`,
		columns: [
			{ // active
				classList: [ 'text-center', 'ps-3', ],
				create: td => {
					const div = document.createElement('div');
					td.appendChild(div);
					div.classList.add('form-check', 'form-switch', 'text-start');

					const checkbox = document.createElement('input');
					div.appendChild(checkbox);
					checkbox.type = 'checkbox';
					checkbox.setAttribute('role', 'switch');
					checkbox.name = 'active';
					checkbox.id = `${u.phone}-${department}-active`;
					checkbox.checked = !!(u[department]?.active);
					checkbox.classList.add('form-check-input');
					checkbox.addEventListener('change', () => {
						departmentValues.active = checkbox.checked;
					});
					checkbox.disabled = !canEditThisDepartment;

					const label = document.createElement('label');
					div.appendChild(label);
					label.classList.add('form-check-label');
					label.innerHTML = department;
					label.setAttribute('for', checkbox.id);

				},
			},
			{ // callsign
				classList: [ 'ps-3', ],
				create: td => {
					const div = document.createElement('div');
					td.appendChild(div);
					div.classList.add('input-group');

					div.appendChild(callsignInput);
					callsignInput.type = 'text';
					callsignInput.name = 'callSign',
					callsignInput.classList.add('form-control');
					callsignInput.value = u[department]?.callSign || '';
					callsignInput.addEventListener('change', () => {
						departmentValues.callSign = callsignInput.value;
					});
					callsignInput.style.maxWidth = '85px';
					callsignInput.disabled = !canEditThisDepartment;
				},
			},
			{ // roles (admin checkbox)
				create: td => {
					const div = document.createElement('div');
					td.appendChild(div);
					div.classList.add('form-check', 'form-switch', 'text-start');

					const isAdminInput: HTMLInputElement = document.createElement('input');
					div.appendChild(isAdminInput);
					isAdminInput.type = 'checkbox';
					isAdminInput.setAttribute('role', 'switch');
					isAdminInput.name = 'admin';
					isAdminInput.id = `${u.phone}-${department}-admin`;
					isAdminInput.checked = defaultDepartmentValues.admin;
					isAdminInput.classList.add('form-check-input');
					isAdminInput.addEventListener('change', () => {
						departmentValues.admin = isAdminInput.checked;
					});
					isAdminInput.disabled = !canEditThisDepartment;
				},
				classList: [],
			},
			{ // save button
				classList: [ 'text-center', ],
				create: (td) => {
					if (!canEditThisDepartment) return;

					td.appendChild(saveButton);
					saveButton.classList.add('btn', 'btn-success', 'm-1');
					saveButton.innerHTML = 'Save';
					saveButton.disabled = true;
					saveButton.addEventListener('click', async () => {
						modifyButton(saveButton, 'secondary', 'Saving', true, false);
						
						const parent = td.parentElement;
						let inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
						if (parent !== null) {
							inputs = [
								...Array.from(parent.querySelectorAll('input')),
							]
							inputs.forEach(input => input.classList.remove('is-invalid'));
						}

						// Make the API call
						let apiNewValues = { ...changedValues };
						const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=updateGroup`, {
							method: 'POST',
							body: JSON.stringify({
								phone: u.phone.toString(),
								department,
								...changedValues
							} as ApiUserUpdateGroupBody),
						}).then(r => r.json());
						saveButton.blur();
						if (apiResult.success) {
							modifyButton(saveButton, 'success', 'Save', false, false);
							(Object.keys(apiNewValues) as (keyof UserObject[UserDepartment])[])
								.forEach(key => {
									defaultDepartmentValues[key] = apiNewValues[key];
									departmentValues[key] = apiNewValues[key];
								});
						} else {
							saveButton.disabled = false;
							modifyButton(saveButton, 'danger', 'Save', false, true);
							showAlert('danger', 'Failed to update user group');
							apiResult.errors = apiResult.errors || [];
							inputs
								.filter(input => apiResult.errors.includes(input.name))
								.forEach(input => input.classList.add('is-invalid'));
						}
					});

					if (u === null || typeof u[department] === 'undefined') return;

					const deleteButton = document.createElement('button');
					td.appendChild(deleteButton);
					deleteButton.classList.add('m-1');
					modifyButton(deleteButton, 'danger', 'Delete');
					deleteButton.addEventListener('click', async () => {
						modifyButton(deleteButton, 'secondary', 'Deleting', true, false);
						const apiResult: ApiUserUpdateResponse = await fetch('/api/user?action=delete', {
							method: 'POST',
							body: JSON.stringify({
								phone: u.phone.toString(),
								department,
							}),
						}).then(r => r.json());
						if (apiResult.success) {
							deleteButton.parentElement?.removeChild(deleteButton);
							Array.from(td.parentElement?.querySelectorAll('input') || [])
								.forEach(input => {
									if (input.type === 'checkbox') {
										input.checked = false;
									} else if (input.type === 'text') {
										input.value = '';
									}
								})
						} else {
							modifyButton(deleteButton, 'danger', 'Delete', false, true);
							showAlert('danger', `Failed to remove department ${department}`);
						}
					});
				},
			},
		],
	};
}

function makeTextInput(conf: InputConfig, parent: HTMLElement, userValues: ApiUserUpdateBody) {
	const container = document.createElement('div');
	parent.appendChild(container);
	container.classList.add('input-group', 'p-2');

	const label = document.createElement('span');
	container.appendChild(label);
	label.classList.add('input-group-text');
	label.innerHTML = conf.placeholder;

	const input = document.createElement('input');
	container.appendChild(input);
	input.type = 'text';
	input.name = conf.name;
	input.classList.add('form-control');
	input.value = typeof conf.iVal !== 'undefined'
		? conf.iVal(userValues)
		: conf.val(userValues);
	input.addEventListener('change', () => (userValues[conf.name] as string) = input.value);
}

const userRoleCheckboxes: CheckboxConfig[] = [
	{
		name: 'isDistrictAdmin',
		label: 'District Admin',
		val: user => user.isDistrictAdmin || false,
		districtAdmin: true
	},
	{
		name: 'getTranscript',
		label: 'Get Transcripts',
		val: user => user.getTranscript || false,
	},
	{
		name: 'getApiAlerts',
		label: 'API Alerts',
		val: user => user.getApiAlerts || false,
		districtAdmin: true
	},
	{
		name: 'getVhfAlerts',
		label: 'VHF Alerts',
		val: user => user.getVhfAlerts || false,
		districtAdmin: true
	},
	{
		name: 'getDtrAlerts',
		label: 'DTR Alerts',
		val: user => user.getDtrAlerts || false,
		districtAdmin: true
	},
];

function buildTalkgroupCheckboxes(u: ApiUserUpdateBody, isNew: boolean = false) {
	logger.trace('buildTalkgroupCheckboxes', ...arguments);
	const inputs: HTMLInputElement[] = [];

	const container = document.createElement('div');
	container.classList.add('input');

	pagingTalkgroupOrder.forEach(key => {
		const div = document.createElement('div');
		container.appendChild(div);
		div.classList.add('form-check', 'form-switch', 'text-start');
		
		const input = document.createElement('input');
		div.appendChild(input);
		input.type = 'checkbox';
		input.setAttribute('role', 'switch');
		input.id = `talkgroups-${key}-${isNew ? 'new' : u.phone}`;
		input.value = key.toString();
		input.name = 'talkgroups';
		input.classList.add('form-check-input');
		input.addEventListener('change', () => {
			if (input.checked && !u.talkgroups?.includes(key))
				u.talkgroups = [
					...u.talkgroups || [],
					key,
				];
			else if (!input.checked && u.talkgroups?.includes(key))
				u.talkgroups = (u.talkgroups || []).filter(v => v !== key);
		});
		if (u.talkgroups?.includes(key))
			input.checked = true;
		inputs.push(input);

		const label = document.createElement('label');
		div.appendChild(label);
		label.classList.add('form-check-label');
		label.innerHTML = pagingConfig[key].partyBeingPaged;
		label.setAttribute('for', input.id);
	});

	return container;
}

function buildCheckboxes(
	u: ApiUserUpdateBody,
	checkboxConfigs: CheckboxConfig[],
	isNew: boolean = false
) {
	logger.trace('buildCheckboxes', ...arguments);
	const container = document.createElement('div');

	checkboxConfigs
		.filter(checkbox => !checkbox.districtAdmin || user.isDistrictAdmin)
		.forEach(checkbox => {
			const div = document.createElement('div');
			container.appendChild(div);
			div.classList.add('form-check', 'form-switch', 'text-start');

			const input = document.createElement('input');
			div.appendChild(input);
			input.type = 'checkbox';
			input.setAttribute('role', 'switch');
			input.name = checkbox.name;
			input.id = `checkboxes-${checkbox.name}-${isNew ? 'new' : u.phone}`;
			input.checked = !isNew && !!u[checkbox.name];
			input.classList.add('form-check-input');
			input.addEventListener('change', () => {
				(u[checkbox.name] as boolean) = input.checked;
			});
			
			const label = document.createElement('label');
			div.appendChild(label);
			label.classList.add('form-check-label');
			label.innerHTML = checkbox.label;
			label.setAttribute('for', input.id);
		});

	return container;
}

function buildUserEdit(u: UserObject | null, parent: HTMLElement) {
	const saveButton = document.createElement('button');

	// Set up the proxy to make the API call easier
	const defaultUserValues: ApiUserUpdateBody = {
		phone: u !== null ? u.phone : '',
		talkgroups: u !== null ? (u.talkgroups || []) : [],
		fName: u !== null ? u.fName : '',
		lName: u !== null ? u.lName : '',
		getTranscript: u !== null ? !!u.getTranscript : false,
		getApiAlerts: u !== null ? !!u.getApiAlerts : false,
		getVhfAlerts: u !== null ? !!u.getVhfAlerts : false,
		getDtrAlerts: u !== null ? !!u.getDtrAlerts : false,
		isDistrictAdmin: u !== null ? !!u.isDistrictAdmin : false,
	};
	const localDefaultDepartment: UserDepartment = userAdminDepartments.includes(defaultDepartment)
		? defaultDepartment
		: userAdminDepartments[0] || defaultDepartment;
	const changedValues: Partial<ApiUserUpdateBody> = {
		...(u !== null ? {} : defaultUserValues),
	};
	const proxyBase: ApiUserUpdateBody = {
		...defaultUserValues,
		talkgroups: [ ...defaultUserValues.talkgroups || [] ],
	};
	const userValues = new Proxy(proxyBase, {
		set: (target, prop: keyof ApiUserUpdateBody, value) => {
			if (
				u !== null &&
				JSON.stringify(value) === JSON.stringify(defaultUserValues[prop])
			) {
				delete changedValues[prop];
			} else {
				(changedValues as any)[prop] = value;
			}
			saveButton.disabled = Object.keys(changedValues).length === 0;

			if (prop === 'department') {
				(departmentConfig[value as UserDepartment]?.defaultTalkgroups || [])
					.forEach(tg => {
						const elem = document.getElementById(`talkgroups-${tg}-new`) as (HTMLInputElement | null);
						if (elem !== null) {
							elem.checked = true;
							if (!changedValues.talkgroups?.includes(tg))
								changedValues.talkgroups?.push(tg);
						}
					});
			}

			(target as any)[prop] = value;
			return true;
		}
	});

	// Global info - fName, lName, roles, alerts, pages
	const mainContainer = document.createElement('div');
	parent.appendChild(mainContainer);
	mainContainer.classList.add('col-xl-6', 'row', 'px-4');
	if (u === null) {
		mainContainer.classList.add('offset-xl-3');
	}

	// Name and phone number (if new)
	const mainSubContainer1 = document.createElement('div');
	mainContainer.appendChild(mainSubContainer1);
	mainSubContainer1.classList.add('col-lg-6', 'offset-lg-3', 'col-md-8', 'offset-md-2', 'col-xl-8', 'offset-xl-2');
	if (u === null) {
		makeTextInput({
			name: 'phone',
			placeholder: 'Phone Number',
			val: u => u.phone || '',
		}, mainSubContainer1, userValues);
	}
	makeTextInput({
		name: 'fName',
		placeholder: 'First Name',
		val: u => u.fName || '',
	}, mainSubContainer1, userValues);
	makeTextInput({
		name: 'lName',
		placeholder: 'Last Name',
		val: u => u.lName || '',
	}, mainSubContainer1, userValues);

	// Department and callsign (if new user)
	if (u === null) {
		if (userAdminDepartments.length > 1) {
			const departmentContainer = document.createElement('div');
			mainSubContainer1.appendChild(departmentContainer);
			departmentContainer.classList.add('input-group', 'p-2');
			const departmentLabel = document.createElement('label');
			departmentContainer.appendChild(departmentLabel);
			departmentLabel.classList.add('input-group-text');
			departmentLabel.innerHTML = 'Department';
			const departmentSelect = document.createElement('select');
			departmentContainer.appendChild(departmentSelect);
			departmentSelect.classList.add('form-select');
			userAdminDepartments
				.forEach(dep => {
					const option = document.createElement('option');
					departmentSelect.appendChild(option);
					option.value = dep;
					option.innerHTML = dep;
					if (dep === localDefaultDepartment) {
						option.selected = true;
					}
				});
			departmentSelect.addEventListener('change', () => {
				userValues.department = departmentSelect.value as UserDepartment;
			});
		}
		setTimeout(() => userValues.department = localDefaultDepartment, 100);

		makeTextInput({
			name: 'callSign',
			placeholder: 'Call Sign',
			val: u => u.callSign || '',
		}, mainSubContainer1, userValues);
	}

	// Pages
	const pagesContainer = document.createElement('div');
	mainContainer.appendChild(pagesContainer);
	pagesContainer.classList.add('col-6', 'col-lg-3', 'col-md-4', 'col-sm-5', 'col-xl-6');
	const pagesTitle = document.createElement('h6');
	pagesContainer.appendChild(pagesTitle);
	pagesTitle.classList.add('text-center');
	pagesTitle.innerHTML = 'Pages';
	const pageGroups = buildTalkgroupCheckboxes(userValues, u === null);
	pagesContainer.appendChild(pageGroups);

	// Roles and Alerts
	const rolesAndAlertsContainer = document.createElement('div');
	mainContainer.appendChild(rolesAndAlertsContainer);
	rolesAndAlertsContainer.classList.add('col-6', 'col-lg-3', 'offset-lg-3', 'col-md-4', 'offset-md-2', 'col-sm-5', 'offset-sm-1', 'col-xl-6', 'offset-xl-0');
	const rolesTitle = document.createElement('h6');
	rolesAndAlertsContainer.appendChild(rolesTitle);
	rolesTitle.classList.add('text-center');
	rolesTitle.innerHTML = 'Roles';
	const rolesAndAlerts = buildCheckboxes(userValues, userRoleCheckboxes);
	rolesAndAlertsContainer.appendChild(rolesAndAlerts);

	// Add the save button
	const btnContainer = document.createElement('div');
	mainContainer.appendChild(btnContainer);
	btnContainer.classList.add('col-lg-6', 'offset-lg-3', 'col-md-8', 'offset-md-2', 'd-grid', 'p-2');
	btnContainer.appendChild(saveButton);
	saveButton.classList.add('btn');
	modifyButton(saveButton, 'success', 'Save', false, false);
	saveButton.addEventListener('click', async () => {
		modifyButton(saveButton, 'secondary', 'Saving', true, false);
		saveButton.blur();

		try {
			const inputs = Array.from(mainContainer.querySelectorAll('input'));
			inputs.forEach(input => input.classList.remove('is-invalid'));
		
			const apiBody: ApiUserUpdateBody = {
				phone: u !== null ? u.phone.toString() : userValues.phone,
				...changedValues,
			};
			const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=${u === null ? 'create' : 'update'}`, {
				method: 'POST',
				body: JSON.stringify(apiBody),
			}).then(r => r.json());
			if (apiResult.success) {
				modifyButton(saveButton, 'success', 'Save', false, false);
				if (u === null) {
					window.location.reload();
				}
			} else {
				modifyButton(saveButton, 'danger', 'Save', false, true);
				showAlert('danger', 'Failed to save user');
				apiResult.errors = apiResult.errors || [];
				inputs
					.filter(input => apiResult.errors.includes(input.name))
					.forEach(input => input.classList.add('is-invalid'));
			}
		} catch (e) {
			logger.error(`Save user ${u !== null ? u.phone : 'new user'} error`, e);
			modifyButton(saveButton, 'danger', 'Save', false, true);
			showAlert('danger', 'Failed to save user');
		}
	});

	// Department information
	if (u !== null) {
		const depContainer = document.createElement('div');
		parent.appendChild(depContainer);
		depContainer.classList.add('table-responsive', 'col-xl-6', 'col-lg-10', 'offset-lg-1', 'offset-xl-0');
		const departmentTable = document.createElement('table');
		depContainer.appendChild(departmentTable);
		departmentTable.classList.add('table', 'mb-0', 'text-center', 'no-bg');
		departmentTable.innerHTML = `<thead><tr><th>Department</th><th>Call Sign</th><th>Admin</th><th></th></tr></thead><tbody></tbody>`;
		const departmentTbody = departmentTable.querySelector('tbody');
		validDepartments
			.filter(dep => userAdminDepartments.includes(dep) || (
				u !== null &&
				u[dep]
			))
			.forEach(dep => createTableRow(departmentTbody, getUserDepartmentRowConfig(u, dep)));
	}
}

const modalItems = {
	name: <HTMLSpanElement>document.getElementById('deleteUser'),
	button: <HTMLButtonElement>document.getElementById('deleteConfirm'),
	department: <HTMLSpanElement>document.getElementById('deleteUserDepartment'),
};

async function init() {
	logger.trace('init', ...arguments);
	if (user.isDistrictAdmin)
		(<HTMLStyleElement>document.getElementById('customStyles')).innerHTML = '';

	const apiResult: ApiUserListResponse = await fetch(`/api/user?action=list`)
		.then(r => r.json());
	
	if (!apiResult.success) {
		showAlert('danger', 'Failed to load users');
		return;
	}

	apiResult.users
		.sort((a, b) => {
			if (a.lName === b.lName)
				return a.fName > b.fName ? 1 : -1;

			return a.lName > b.lName ? 1 : -1;
		})
		.map((u, idx) => {
			let doHighlight = idx % 2 === 0;
			let editRow: HTMLTableRowElement;

			// Create the main row
			const mainRow = createTableRow(tbody, {
				id: `user-${u.phone}`,
				classList: [
					...(doHighlight ? [ 'alternate' ] : []),
				],
				columns: [
					{
						classList: [ 'text-center' ],
						html: formatPhone(u.phone),
					},
					{
						classList: [ 'text-center' ],
						html: `${u.lName}, ${u.fName}`,
					},
					{
						classList: [ 'text-center' ],
						html: validDepartments
							.filter(dep => u[dep]?.active)
							.map(dep => `${dep} (${u[dep]?.callSign || '??'})`)
							.join(', '),
					},
					{
						classList: [ 'text-center' ],
						create: td => {
							const editButton = document.createElement('button');
							td.appendChild(editButton);
							editButton.classList.add('mx-1');
							modifyButton(editButton, 'primary', 'Edit');

							let editRowOpen = false;
							editButton.addEventListener('click', () => {
								editRow.hidden = editRowOpen;
								if (!editRowOpen) {
									modifyButton(editButton, 'secondary', 'Close');
								} else {
									modifyButton(editButton, 'primary', 'Edit');
								}
								editRowOpen = !editRowOpen;
							});

							if (user.isDistrictAdmin) {
								const deleteButton = document.createElement('button');
								td.appendChild(deleteButton);
								deleteButton.classList.add('mx-1');
								modifyButton(deleteButton, 'danger', 'Delete');
								deleteButton.setAttribute('data-bs-toggle', 'modal');
								deleteButton.setAttribute('data-bs-target', '#delete-modal');
								deleteButton.addEventListener('click', () => {
									deleteButton.blur();

									modalItems.name.innerHTML = `${u.fName} ${u.lName}`
									modalItems.department.innerHTML = validDepartments
										.filter(dep => u[dep]?.active)
										.join(', ');
									if (modalItems.department.innerHTML === '') {
										modalItems.department.innerHTML = 'no departments';
									}

									const newButton = <HTMLButtonElement>modalItems.button.cloneNode(true);
									if (modalItems.button.parentElement !== null)
										modalItems.button.parentElement.replaceChild(newButton, modalItems.button);
									modalItems.button = newButton;

									newButton.addEventListener('click', async () => {
										modifyButton(deleteButton, 'secondary', 'Deleting', true, false);

										const result = await fetch('/api/user?action=delete', {
											method: 'POST',
											body: JSON.stringify({
												phone: u.phone.toString(),
											}),
										}).then(r => r.json());

										if (result.success) {
											if (mainRow.parentElement)
												mainRow.parentElement.removeChild(mainRow);

											if (editRow.parentElement)
												editRow.parentElement.removeChild(editRow);
										} else {
											modifyButton(deleteButton, 'danger', 'Delete', false, true);
											showAlert('danger', 'Failed to delete user');
										}
									});
								});
							}
						},
					},
				],
			});

			// Create the edit row
			editRow = createTableRow(tbody, {
				id: `user-${u.phone}-edit`,
				classList: [
					...(doHighlight ? [ 'alternate' ] : []),
				],
				columns: [
					{
						create: td => {
							td.setAttribute('colspan', '4');
							const container = document.createElement('div');
							td.appendChild(container);
							container.classList.add('container');
							
							if (user.isDistrictAdmin) {
								const infoRow = document.createElement('div');
								container.appendChild(infoRow);
								infoRow.classList.add('row', 'text-center');

								const lastLoginDiv = document.createElement('div');
								infoRow.appendChild(lastLoginDiv);
								lastLoginDiv.classList.add('col-md-6');
								lastLoginDiv.innerHTML = `<b>Last Login:</b> ${typeof u.lastLogin === 'undefined' ? 'Never' : new Date(u.lastLogin)}`;

								const validTokensDiv = document.createElement('div');
								infoRow.appendChild(validTokensDiv);
								validTokensDiv.classList.add('col-md-6');
								validTokensDiv.innerHTML = `<b>Logged In Devices:</b> ${typeof u.loginTokens === 'undefined' ? '0' : u.loginTokens.filter(v => v.tokenExpiry > Date.now()).length}`;
							}

							const row = document.createElement('div');
							container.appendChild(row);
							row.classList.add('row');
							buildUserEdit(u, row);
						}
					}
				]
			});
			editRow.hidden = true;
		});

	// Make the new user row
	createTableRow(tbody, {
		id: `user-new`,
		classList: [
			...(apiResult.users.length % 2 === 0 ? [ 'alternate' ] : []),
		],
		columns: [
			{
				classList: [ 'text-center' ],
				create: td => {
					td.setAttribute('colspan', '3');
					td.innerHTML = 'Create a New User';
				},
			},
			{
				classList: [ 'text-center' ],
				create: td => {
					const editButton = document.createElement('button');
					td.appendChild(editButton);
					editButton.classList.add('mx-1');
					modifyButton(editButton, 'primary', 'Open');

					let editRowOpen = false;
					editButton.addEventListener('click', () => {
						newUserRow.hidden = editRowOpen;
						if (!editRowOpen) {
							modifyButton(editButton, 'secondary', 'Close');
						} else {
							modifyButton(editButton, 'primary', 'Open');
						}
						editRowOpen = !editRowOpen;
					});
				},
			},
		],
	});
	const newUserRow = createTableRow(tbody, {
		id: `user-new-edit`,
		classList: [
			...(apiResult.users.length % 2 === 0 ? [ 'alternate' ] : []),
		],
		columns: [
			{
				create: td => {
					td.setAttribute('colspan', '4');
					const container = document.createElement('div');
					td.appendChild(container);
					container.classList.add('container');
					const row = document.createElement('div');
					container.appendChild(row);
					row.classList.add('row');
					buildUserEdit(null, row);
				}
			}
		]
	});
	newUserRow.hidden = true;

	doneLoading();
}
init();
