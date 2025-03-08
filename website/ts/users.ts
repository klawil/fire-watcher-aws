import { ApiUserListResponse, ApiUserUpdateResponse, UserObject, UserObjectBooleans, UserObjectStrings } from "../../common/userApi";
import { showAlert } from "./utils/alerts";
import { user } from "./utils/auth";
import { changeButtonColor } from "./utils/button";
import { doneLoading } from "./utils/loading";
import { RowConfig, createTableRow } from "./utils/table";
import { formatPhone, pageNames, talkgroupOrder, validDepartments } from "./utils/userConstants";

interface CheckboxConfig {
	name: UserObjectBooleans;
	label: string;
	districtAdmin?: boolean;
	val: (a: UserObject) => boolean;
}

interface InputConfig {
	name: UserObjectStrings;
	placeholder: string;
	editable: boolean;
	val: (u: UserObject) => string;
	iVal?: (u: UserObject) => string;
	format?: (a: string) => string;
	maxWidth?: string;
}

const tbody = document.getElementById('tbody');
const modalItems = {
	name: document.getElementById('deleteUser'),
	button: document.getElementById('deleteConfirm'),
};

function getUserRowConfig(u: UserObject | null): RowConfig {
	const newUserObj: UserObject = {
		phone: u === null ? '' : u.phone.toString(),
		fName: u === null ? '' : u.fName,
		lName: u === null ? '' : u.lName,
		callSign: u === null ? '' : u.callSign.toString(),
		talkgroups: u === null ? [] : u.talkgroups,
	};
	let enableProxy = false;
	const newUser = new Proxy(newUserObj, {
		set: (target, prop: UserObjectStrings, value) => {
			if (enableProxy)
				button.disabled = false;
			target[prop] = value;
			return true;
		}
	});
	if (u !== null)
		userRows.push(newUser);
	const resetInputs: Function[] = [];
	let button: HTMLButtonElement;

	const makeInputCreationFn = (conf: InputConfig) => (td: HTMLTableCellElement) => {
		if (conf.maxWidth)
			td.style.maxWidth = conf.maxWidth;

		let span: HTMLSpanElement;
		if (u !== null) {
			span = document.createElement('span');
			td.appendChild(span);
			span.innerHTML = conf.val(u);
		}

		if (u === null || conf.editable) {
			const input = document.createElement('input');
			td.appendChild(input);
			input.type = 'text';
			input.name = conf.name;
			input.classList.add('form-control');
			input.placeholder = conf.placeholder;
			input.value = typeof conf.iVal !== 'undefined'
				? conf.iVal(newUser)
				: conf.val(newUser);
			input.addEventListener('change', () => newUser[conf.name] = input.value);

			if (u !== null) {
				input.classList.add('d-none');
				let listenerRun = false;
				td.addEventListener('click', () => {
					if (listenerRun) return;
					listenerRun = true;
				
					input.classList.remove('d-none');
					span.classList.add('d-none');
					input.focus();
				});
			
				resetInputs.push(() => {
					span.innerHTML = conf.format
						? conf.format(conf.val(newUser))
						: conf.val(newUser);

					span.classList.remove('d-none');
					input.classList.add('d-none');
				});
			}
		}
	}

	return {
		id: newUser.phone === '' ? 'new-user-row' : newUser.phone,
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
				classList: [ 'ps-3', 'text-center' ],
				create: makeInputCreationFn({
					name: 'fName',
					placeholder: 'First Name',
					editable: true,
					val: u => u.fName,
				}),
			},
			{ // lName
				classList: [ 'ps-3', 'text-center' ],
				create: makeInputCreationFn({
					name: 'lName',
					placeholder: 'Last Name',
					editable: true,
					val: u => u.lName,
				}),
			},
			{ // department
				filter: !!user.isDistrictAdmin,
				create: td => {
					const input = buildDepartmentSelect(u, newUser);
					td.appendChild(input);
				}
			},
			{ // callSign
				classList: [ 'text-center' ],
				create: makeInputCreationFn({
					name: 'callSign',
					placeholder: 'Callsign',
					editable: true,
					val: u => u.callSign,
					maxWidth: '75px',
				}),
			},
			{ // roles
				create: td => {
					const input = buildCheckboxes(newUser, userRoleCheckboxes);
					td.appendChild(input);
				}
			},
			{ // alerts
				filter: !!user.isDistrictAdmin,
				create: td => {
					const input = buildCheckboxes(newUser, userAlertCheckboxes);
					td.appendChild(input);
				}
			},
			{ // talkgroups
				create: td => {
					const input = buildTalkgroupCheckboxes(u, newUser);
					td.appendChild(input);
				}
			},
			{ // button
				classList: [ 'text-center' ],
				create: td => {
					button = document.createElement('button');
					td.appendChild(button);
					button.classList.add('btn', 'btn-success', 'mv-1');
					button.innerHTML = u === null ? 'Create' : 'Save';
					button.disabled = true;
					button.addEventListener('click', async () => {
						button.disabled = true;
						changeButtonColor(button, 'secondary');
						const inputs: (HTMLInputElement | HTMLSelectElement)[] = [
							...Array.from(td.parentElement.querySelectorAll('input')),
							...Array.from(td.parentElement.querySelectorAll('select')),
						];
						inputs.forEach(input => input.classList.remove('is-invalid'));

						const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=${u === null ? 'create' : 'update'}`, {
							method: 'POST',
							body: JSON.stringify(newUser),
						}).then(r => r.json());
						button.blur();
						if (apiResult.success) {
							resetInputs.forEach(fn => fn());
							changeButtonColor(button, 'success');
							if (u === null) {
								createTableRow(tbody, getUserRowConfig(newUser));
								createTableRow(tbody, getUserRowConfig(null));
								td.parentElement.parentElement.removeChild(td.parentElement);
								userRows.push(newUser);
							}
							resortRows();
						} else {
							button.disabled = false;
							changeButtonColor(button, 'danger');
							showAlert('danger', 'Failed to save user');
							apiResult.errors = apiResult.errors || [];
							inputs
								.filter(input => apiResult.errors.indexOf(input.getAttribute('name')) !== -1)
								.forEach(input => input.classList.add('is-invalid'));
						}
					});

					if (u !== null) {
						const deleteButton = document.createElement('button');
						td.appendChild(deleteButton);
						deleteButton.classList.add('btn', 'btn-danger', 'm-1');
						deleteButton.innerHTML = 'Delete';
						deleteButton.setAttribute('data-bs-toggle', 'modal');
						deleteButton.setAttribute('data-bs-target', '#delete-modal');
						deleteButton.addEventListener('click', () => {
							deleteButton.blur();

							modalItems.name.innerHTML = `${newUser.fName} ${newUser.lName}`;
							const newButton = <HTMLButtonElement>modalItems.button.cloneNode(true);
							modalItems.button.parentElement.replaceChild(newButton, modalItems.button);
							modalItems.button = newButton;

							newButton.addEventListener('click', async () => {
								changeButtonColor(deleteButton, 'secondary');
								deleteButton.blur();

								const result = await fetch(`/api/user?action=delete`, {
									method: 'POST',
									body: JSON.stringify({
										phone: newUser.phone,
									}),
								}).then(r => r.json());

								if (result.success)
									td.parentElement.parentElement.removeChild(td.parentElement);
								else {
									changeButtonColor(deleteButton, 'danger');
									showAlert('danger', 'Failed to delete user');
								}
							});
						});
					}
				
					enableProxy = true;
				}
			},
		]
	};
}

const userRoleCheckboxes: CheckboxConfig[] = [
	{
		name: 'isActive',
		label: 'Active',
		val: user => user.isActive || false
	},
	{
		name: 'isAdmin',
		label: 'Admin',
		val: user => user.isAdmin || false
	},
	{
		name: 'pageOnly',
		label: 'Pages Only',
		val: user => user.pageOnly || false,
		districtAdmin: true
	},
	{
		name: 'getTranscript',
		label: 'Get Transcripts',
		val: user => user.getTranscript || false,
		districtAdmin: true
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

function buildDepartmentSelect(u: UserObject | null, newUser: UserObject) {
	const select = document.createElement('select');
	select.classList.add('form-select');
	select.name = 'department';
	select.id = `${u === null ? 'new' : u.callSign}-department`;
	validDepartments.forEach(value => {
		const option = document.createElement('option');
		select.appendChild(option);
		option.value = value;
		option.innerHTML = value;
		if (
			(u === null && user.department === value) ||
			(u !== null && u.department === value)
		)
			option.selected = true;
	});

	newUser.department = select.value;
	select.addEventListener('change', () => newUser.department = select.value);

	return select;
}

function buildTalkgroupCheckboxes(u: UserObject | null, newUser: UserObject) {
	const inputs: HTMLInputElement[] = [];

	const container = document.createElement('div');
	container.classList.add('input');

	talkgroupOrder.forEach(key => {
		const div = document.createElement('div');
		container.appendChild(div);
		div.classList.add('form-check', 'form-switch', 'text-start');
		
		const input = document.createElement('input');
		div.appendChild(input);
		input.type = 'checkbox';
		input.setAttribute('role', 'switch');
		input.id = `talkgroups-${key}-${u === null ? 'new' : u.callSign}`;
		input.value = key.toString();
		input.name = 'talkgroups';
		input.classList.add('form-check-input');
		input.addEventListener('change', () => {
			if (input.checked && newUser.talkgroups.indexOf(key) === -1)
				newUser.talkgroups = [
					...newUser.talkgroups,
					key,
				];
			else if (!input.checked && newUser.talkgroups.indexOf(key) !== -1)
				newUser.talkgroups = newUser.talkgroups.filter(v => v !== key);
		});
		if (newUser.talkgroups.indexOf(key) !== -1)
			input.checked = true;
		inputs.push(input);

		const label = document.createElement('label');
		div.appendChild(label);
		label.classList.add('form-check-label');
		label.innerHTML = pageNames[key];
		label.setAttribute('for', input.id);
	});

	return container;
}

function buildCheckboxes(
	u: UserObject,
	checkboxConfigs: CheckboxConfig[],
) {
	const container = document.createElement('div');

	checkboxConfigs
		.filter(checkbox => !checkbox.districtAdmin || user.isDistrictAdmin)
		.forEach(checkbox => {
			const div = document.createElement('div');
			container.appendChild(div);
			div.classList.add('form-check', 'form-switch', 'text-start');

			u[checkbox.name] = !!u[checkbox.name];

			const input = document.createElement('input');
			div.appendChild(input);
			input.type = 'checkbox';
			input.setAttribute('role', 'switch');
			input.name = checkbox.name;
			input.id = `checkboxes-${checkbox.name}-${u === null ? 'new' : u.callSign}`;
			input.checked = u[checkbox.name];
			input.classList.add('form-check-input');
			input.addEventListener('change', () => {
				u[checkbox.name] = input.checked;
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
let userRows: UserObject[] = [];
function sortRows(keysString: string) {
	console.log('sortRows', keysString, lastSort, currentSortIndex);
	const keys = <UserObjectStrings[]>keysString.split(',');
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

			return a[key] > b[key]
				? aGreater
				: aLesser;
		})
		.forEach(user => {
			const tr = document.getElementById(user.phone);
			tbody.appendChild(tr);
		});
	tbody.appendChild(document.getElementById('new-user-row'));
}
function resortRows() {
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
		sortRows(label.getAttribute('data-keys'))));

async function init() {
	if (user.isDistrictAdmin)
		document.getElementById('customStyles').innerHTML = '';

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
		.map(u => createTableRow(tbody, getUserRowConfig(u)));

	createTableRow(tbody, getUserRowConfig(null));

	doneLoading();
}
init();
