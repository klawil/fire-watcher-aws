import { ApiUserListResponse, ApiUserUpdateBody, ApiUserUpdateGroupBody, ApiUserUpdateResponse, UserObject } from "../../common/userApi";
import { UserDepartment, pagingConfig, pagingTalkgroupOrder, validDepartments } from "../../common/userConstants";
import { showAlert } from "./utils/alerts";
import { user } from "./utils/auth";
import { changeButtonColor } from "./utils/button";
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
	editable: boolean;
	val: (u: ApiUserUpdateBody) => string;
	iVal?: (u: ApiUserUpdateBody) => string;
	format?: (a: string) => string;
	maxWidth?: string;
}

const tbody = <HTMLTableSectionElement>document.getElementById('tbody');

function getUserDepartmentRowConfig(u: UserObject, department: UserDepartment, doHighlight: boolean): RowConfig {
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
		classList: [
			'right-border-cell',
			'no-border',
			...(doHighlight ? [ 'alternate' ] : []),
		],
		columns: [
			{ html: '', },
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

					const label = document.createElement('span');
					div.appendChild(label);
					label.classList.add('input-group-text');
					label.innerHTML = 'Call Sign';

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

					const label = document.createElement('label');
					div.appendChild(label);
					label.classList.add('form-check-label');
					label.innerHTML = 'Admin';
					label.setAttribute('for', isAdminInput.id);
				},
				classList: [],
			},
			{ // save button
				classList: [ 'text-center', ],
				create: (td) => {
					td.appendChild(saveButton);
					saveButton.classList.add('btn', 'btn-success', 'mv-1');
					saveButton.innerHTML = 'Save';
					saveButton.disabled = true;
					saveButton.addEventListener('click', async () => {
						saveButton.disabled = true;
						changeButtonColor(saveButton, 'secondary');
						
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
							changeButtonColor(saveButton, 'success');
							(Object.keys(apiNewValues) as (keyof UserObject[UserDepartment])[])
								.forEach(key => {
									defaultDepartmentValues[key] = apiNewValues[key];
									departmentValues[key] = apiNewValues[key];
								});
						} else {
							saveButton.disabled = false;
							changeButtonColor(saveButton, 'danger');
							showAlert('danger', 'Failed to update user group');
							apiResult.errors = apiResult.errors || [];
							inputs
								.filter(input => apiResult.errors.includes(input.name))
								.forEach(input => input.classList.add('is-invalid'));
						}
					});
				},
			},
		],
	};
}

function getUserRowConfig(u: UserObject, doHighlight: boolean, numDepartments: number): RowConfig {
	logger.trace('getUserRowConfig', ...arguments);

	const saveButton: HTMLButtonElement = document.createElement('button');

	const defaultUserValues: ApiUserUpdateBody = {
		phone: u.phone,
		talkgroups: u.talkgroups || [],
		fName: u.fName,
		lName: u.lName,
		getTranscript: !!u.getTranscript,
		pageOnly: !!u.pageOnly,
		getApiAlerts: !!u.getApiAlerts,
		getVhfAlerts: !!u.getVhfAlerts,
		getDtrAlerts: !!u.getDtrAlerts,
		isDistrictAdmin: !!u.isDistrictAdmin,
	};
	const changedValues: Partial<ApiUserUpdateBody> = {};
	const proxyBase: ApiUserUpdateBody = {
		...defaultUserValues,
		talkgroups: [ ...defaultUserValues.talkgroups || [] ],
	};
	const userValues = new Proxy(proxyBase, {
		set: (target, prop: keyof ApiUserUpdateBody, value) => {
			if (JSON.stringify(value) === JSON.stringify(defaultUserValues[prop])) {
				delete changedValues[prop];
			} else {
				(changedValues as any)[prop] = value;
			}
			saveButton.disabled = Object.keys(changedValues).length === 0;

			(target as any)[prop] = value;
			return true;
		}
	});

	userRows.push(userValues);

	const makeInputCreationFn = (conf: InputConfig) => (td: HTMLTableCellElement) => {
		if (conf.maxWidth)
			td.style.maxWidth = conf.maxWidth;

		let span: HTMLSpanElement;
		if (!conf.editable) {
			span = document.createElement('span');
			td.appendChild(span);
			span.innerHTML = conf.val(u);
		}

		if (conf.editable) {
			const input = document.createElement('input');
			td.appendChild(input);
			input.type = 'text';
			input.name = conf.name;
			input.classList.add('form-control');
			input.placeholder = conf.placeholder;
			input.value = typeof conf.iVal !== 'undefined'
				? conf.iVal(userValues)
				: conf.val(userValues);
			input.addEventListener('change', () => (userValues[conf.name] as string) = input.value);
		}
	}

	return {
		id: defaultUserValues.phone,
		classList: [ 'no-border', ...(doHighlight ? ['alternate'] : []) ],
		columns: [
			{ // phone
				classList: [ 'text-center' ],
				create: makeInputCreationFn({
					name: 'phone',
					placeholder: 'Phone',
					editable: false,
					val: u => formatPhone(u.phone),
					iVal: u => u.phone,
					format: phone => formatPhone(phone),
					maxWidth: '100px',
				})
			},
			{ // fName
				classList: [ 'ps-3', 'text-center', ],
				create: makeInputCreationFn({
					name: 'fName',
					placeholder: 'First Name',
					editable: true,
					val: u => u.fName || '',
				}),
			},
			{ // lName
				classList: [ 'ps-3', 'text-center', ],
				create: makeInputCreationFn({
					name: 'lName',
					placeholder: 'Last Name',
					editable: true,
					val: u => u.lName || '',
				}),
			},
			{ // roles
				create: td => {
					const input = buildCheckboxes(userValues, userRoleCheckboxes);
					td.appendChild(input);
				}
			},
			{ // alerts
				create: td => {
					if (!!user.isDistrictAdmin) {
						const input = buildCheckboxes(userValues, userAlertCheckboxes);
						td.appendChild(input);
					}
				},
			},
			{ // talkgroups
				classList: [ 'ps-3', ],
				create: td => {
					td.setAttribute('ROWSPAN', (numDepartments + 1).toString());

					const input = buildTalkgroupCheckboxes(userValues);
					td.appendChild(input);
				}
			},
			{ // button
				classList: [ 'text-center', ],
				create: td => {
					td.setAttribute('ROWSPAN', (numDepartments + 1).toString());

					td.appendChild(saveButton);
					saveButton.classList.add('btn', 'btn-success', 'mv-1');
					saveButton.innerHTML = 'Save';
					saveButton.disabled = true;
					saveButton.addEventListener('click', async () => {
						saveButton.disabled = true;
						changeButtonColor(saveButton, 'secondary');
						const parent = td.parentElement;
						let inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
						if (parent !== null) {
							inputs = [
								...Array.from(parent.querySelectorAll('input')),
							];
							inputs.forEach(input => input.classList.remove('is-invalid'));
						}

						const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=update`, {
							method: 'POST',
							body: JSON.stringify({
								phone: defaultUserValues.phone.toString(),
								...changedValues,
							}),
						}).then(r => r.json());
						saveButton.blur();
						if (apiResult.success) {
							changeButtonColor(saveButton, 'success');
						} else {
							saveButton.disabled = false;
							changeButtonColor(saveButton, 'danger');
							showAlert('danger', 'Failed to save user');
							apiResult.errors = apiResult.errors || [];
							inputs
								.filter(input => apiResult.errors.includes(input.getAttribute('name') || ''))
								.forEach(input => input.classList.add('is-invalid'));
						}
					});

					// if (u !== null) {
					// 	const deleteButton = document.createElement('button');
					// 	td.appendChild(deleteButton);
					// 	deleteButton.classList.add('btn', 'btn-danger', 'm-1');
					// 	deleteButton.innerHTML = 'Delete';
					// 	deleteButton.setAttribute('data-bs-toggle', 'modal');
					// 	deleteButton.setAttribute('data-bs-target', '#delete-modal');
					// 	deleteButton.addEventListener('click', () => {
					// 		deleteButton.blur();

					// 		modalItems.name.innerHTML = `${userValues.fName} ${userValues.lName}`;
					// 		const newButton = <HTMLButtonElement>modalItems.button.cloneNode(true);
					// 		if (modalItems.button.parentElement !== null)
					// 			modalItems.button.parentElement.replaceChild(newButton, modalItems.button);
					// 		modalItems.button = newButton;

					// 		newButton.addEventListener('click', async () => {
					// 			changeButtonColor(deleteButton, 'secondary');
					// 			deleteButton.blur();

					// 			const result = await fetch(`/api/user?action=delete`, {
					// 				method: 'POST',
					// 				body: JSON.stringify({
					// 					phone: userValues.phone,
					// 				}),
					// 			}).then(r => r.json());

					// 			if (result.success) {
					// 				if (td.parentElement !== null && td.parentElement.parentElement !== null)
					// 					td.parentElement.parentElement.removeChild(td.parentElement);
					// 			} else {
					// 				changeButtonColor(deleteButton, 'danger');
					// 				showAlert('danger', 'Failed to delete user');
					// 			}
					// 		});
					// 	});
					// }
				}
			},
		]
	};
}

const userRoleCheckboxes: CheckboxConfig[] = [
	{
		name: 'isDistrictAdmin',
		label: 'District Admin',
		val: user => user.isDistrictAdmin || false,
		districtAdmin: true
	},
	{
		name: 'pageOnly',
		label: 'Pages Only',
		val: user => user.pageOnly || false,
	},
	{
		name: 'getTranscript',
		label: 'Get Transcripts',
		val: user => user.getTranscript || false,
	}
];

const userAlertCheckboxes: CheckboxConfig[] = [
	{
		name: 'getApiAlerts',
		label: 'API',
		val: user => user.getApiAlerts || false
	},
	{
		name: 'getVhfAlerts',
		label: 'VHF',
		val: user => user.getVhfAlerts || false
	},
	{
		name: 'getDtrAlerts',
		label: 'DTR',
		val: user => user.getDtrAlerts || false
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

let lastSort = 'lName,fName';
let currentSortIndex = 0;
let userRows: ApiUserUpdateBody[] = [];
function sortRows(keysString: string) {
	logger.trace('sortRows', ...arguments);
	const keys = <(keyof ApiUserUpdateBody)[]>keysString.split(',');
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
	
	userRows
		.sort((a, b) => {
			let i = 0;
			while (i < keys.length && a[keys[i]] === b[keys[i]]) {
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

			if (typeof a[key] === 'undefined') {
				return aLesser;
			} else if (typeof b[key] === 'undefined') {
				return aGreater;
			}

			return (a[key] as any) > (b[key] as any)
				? aGreater
				: aLesser;
		})
		.forEach((user, idx) => {
			let method: 'add' | 'remove' = idx % 2 === 0 ? 'add' : 'remove';
			const tr = document.getElementById(user.phone);
			if (tr !== null) {
				tbody.appendChild(tr);
				tr.classList[method]('alternate');
			}

			validDepartments.forEach(rowIdPart => {
				const tr = document.getElementById(`${user.phone}-${rowIdPart}`);
				if (tr !== null) {
					tbody.appendChild(tr);
					tr.classList[method]('alternate');
				}
			});
		});
	// tbody.appendChild(<HTMLTableRowElement>document.getElementById('new-user-row'));
}
function resortRows() {
	logger.trace('resortRows', ...arguments);
	if (currentSortIndex > 0) {
		currentSortIndex--;
		sortRows(lastSort);
	} else {
		const sort = lastSort;
		lastSort = '';
		sortRows(sort);
	}
}
declare global {
	interface Window {
		resortRows: Function;
	}
}
window.resortRows = resortRows;
Array.from(document.querySelectorAll('.sortLabel'))
	.forEach(label => label.addEventListener('click', () =>
		sortRows(label.getAttribute('data-keys') || '')));

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

	// Get the departments the user can modify
	const userDepartments = validDepartments
		.filter(dep => user.isDistrictAdmin || (
			user[dep]?.admin &&
			user[dep]?.active
		))

	apiResult.users
		.sort((a, b) => {
			if (a.lName === b.lName)
				return a.fName > b.fName ? 1 : -1;

			return a.lName > b.lName ? 1 : -1;
		})
		.map((u, idx) => {
			let doHighlight = idx % 2 === 0;

			// Create the main row
			createTableRow(tbody, getUserRowConfig(u, doHighlight, userDepartments.length));
			
			// Create the department rows
			userDepartments
				.forEach(dep => createTableRow(tbody, getUserDepartmentRowConfig(u, dep, doHighlight)));
		});

	// createTableRow(tbody, getUserRowConfig(null, apiResult.users.length % 2 === 0, 0));

	doneLoading();
}
init();
