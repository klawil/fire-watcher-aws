import { ButtonColors, changeButtonColor, modifyButton } from './utils/button';
import { ApiConferenceGetResponse, ApiConferenceKickUserResponse, ApiConferenceTokenResponse, ConferenceAttendeeObject } from '../../common/conferenceApi';
import { showAlert } from './utils/alerts';
import { afterAuthUpdate, user } from './utils/auth';
import * as twilio from '@twilio/voice-sdk';
import { ApiUserListResponse, UserObject } from '../../common/userApi';
import { formatPhone } from './utils/userConstants';
import { createTableRow } from './utils/table';
import { getLogger } from '../../stack/resources/utils/logger';

const logger = getLogger('conf');

interface ButtonConfig {
	color: ButtonColors;
	innerText: string;
	enabled: boolean;
	spinner: boolean;
}

const buttonConfigs: {
	[key: string]: ButtonConfig;
} = {
	joining: {
		color: 'secondary',
		innerText: 'Joining...',
		enabled: false,
		spinner: true,
	},
	leaving: {
		color: 'secondary',
		innerText: 'Leaving...',
		enabled: false,
		spinner: true,
	},
	join: {
		color: 'success',
		innerText: 'Start or Join Call',
		enabled: true,
		spinner: false,
	},
	leave: {
		color: 'warning',
		innerText: 'Leave Call',
		enabled: true,
		spinner: false,
	},
	on_call: {
		color: 'secondary',
		innerText: 'Already In',
		enabled: false,
		spinner: false,
	},
	inviting: {
		color: 'secondary',
		innerText: 'Calling...',
		enabled: false,
		spinner: true,
	},
	can_invite: {
		color: 'success',
		innerText: 'Invite',
		enabled: true,
		spinner: false,
	},
	end: {
		color: 'danger',
		innerText: 'End Call For All',
		enabled: true,
		spinner: false,
	},
	ending: {
		color: 'secondary',
		innerText: 'Ending Call...',
		enabled: false,
		spinner: false,
	},
};
function updateButton(btn: HTMLButtonElement, state: string) {
	logger.trace('updateButton', ...arguments);
	if (typeof buttonConfigs[state] === 'undefined')
		throw new Error(`Invalid button state - ${state}`);

	const {
		color,
		innerText,
		enabled,
		spinner
	} = buttonConfigs[state];

	changeButtonColor(btn, color);
	btn.innerHTML = '';
	btn.disabled = !enabled;
	btn.setAttribute('data-state', state);

	if (spinner) {
		const spinDiv = document.createElement('div');
		spinDiv.classList.add('spinner-border', 'spinner-border-sm');
		btn.appendChild(spinDiv);
	}

	btn.innerHTML += (spinner ? ' ': '') + innerText;
}

const participantsLoading = <HTMLDivElement>document.getElementById('participantsLoading');
const participantsTable = <HTMLTableSectionElement>document.getElementById('participantsTable');
const participantsNone = <HTMLDivElement>document.getElementById('participantsNone');
const participantsBody = <HTMLTableSectionElement>document.getElementById('participants');

const endButton = <HTMLButtonElement>document.getElementById('endButton');
const endButtonContainer = <HTMLDivElement>document.getElementById('endButtonContainer');
const startButton = <HTMLButtonElement>document.getElementById('startButton');

const invitableUsersContainer = <HTMLDivElement>document.getElementById('addMembersContainer');
const invitableUsersTable = <HTMLTableSectionElement>document.getElementById('invitableUsers');

let lastParticipants: ConferenceAttendeeObject[] = [];
let lastStartTime: number;
let myCallSid = '';

let call: twilio.Call;

function highlightRow(tr: HTMLTableRowElement) {
	logger.trace('highlightRow', ...arguments);
	setTimeout(() => tr.classList.add('bg-opacity-50', 'bg-success'), 1000);
	setTimeout(() => tr.classList.remove('bg-success', 'bg-opacity-50'), 3000);
}

const createKickUserFn = (btn: HTMLButtonElement, callSid: string) => async () => {
	logger.trace('kickUserFn', btn, callSid);
	modifyButton(btn, 'secondary', 'Removing...', true, false);

	let result: ApiConferenceKickUserResponse = {
		success: false,
	};
	try {
		result = await fetch (`/api/conference?action=kickUser&callSid=${encodeURIComponent(callSid)}`)
			.then(r => r.json());
	} catch (e) {
		result.message = (<Error>e).message;
	}

	if (!result.success) {
		showAlert('danger', `Failed to remove participant${result.message ? ` - ${result.message}` : ''}`);
		modifyButton(btn, 'danger', 'Remove', false, true);
	} else {
		modifyButton(btn, 'secondary', 'Removed', false, false);
	}
};

function showParticipants(participants: ConferenceAttendeeObject[]) {
	logger.trace('showParticipants', ...arguments);
	const lastParticipantIds = lastParticipants.map(u => u.CallSid);
	lastParticipants = participants;

	let validParticipants: string[] = [];
	let inMeetingCallsign: string[] = [];

	if (participants.length === 0) {
		participantsTable.hidden = true;
		participantsNone.hidden = false;
		endButtonContainer.classList.add('d-none');
		return;
	}

	participantsTable.hidden = false;
	participantsNone.hidden = true;
	endButtonContainer.classList.remove('d-none');

	participants.forEach(caller => {
		validParticipants.push(caller.CallSid);
		inMeetingCallsign.push(caller.CallSign);
		const existingRow = <HTMLTableRowElement>document.getElementById(caller.CallSid);
		if (
			existingRow !== null &&
			lastParticipantIds.includes(caller.CallSid)
		) return;

		if (existingRow !== null) {
			highlightRow(existingRow);
			return;
		};

		createTableRow(participantsBody, {
			id: caller.CallSid,
			columns: [
				{
					html: caller.CallSid === myCallSid ? 'Me' : '',
				},
				{
					html: `${caller.FirstName} ${caller.LastName} (${caller.CallSign})`,
				},
				{
					html: caller.Type.replace(/^(.)(.+)$/, (a, b, c) => `${b.toUpperCase()}${c}`),
				},
				{
					filter: !!user.isAdmin,
					create: td => {
						const kickBtn = document.createElement('button');
						td.appendChild(kickBtn);
						kickBtn.classList.add('btn', 'btn-danger');
						kickBtn.innerHTML = 'Remove';
						kickBtn.addEventListener('click', createKickUserFn(kickBtn, caller.CallSid));
					},
				},
			]
		});
	});

	Array.from(participantsBody.querySelectorAll('tr')).forEach(row => {
		if (
			validParticipants.includes(row.id) ||
			row.parentElement === null
		) return;

		row.parentElement.removeChild(row);
	});

	(<HTMLButtonElement[]>Array.from(invitableUsersTable.querySelectorAll('.invite-button'))).forEach(btn => {
		const phone = btn.getAttribute('data-phone') || '999';
		if (
			!inMeetingCallsign.includes(phone) &&
			btn.getAttribute('data-state') === 'on_call'
		) {
			updateButton(btn, 'can_invite');
		} else if (
			inMeetingCallsign.includes(phone) &&
			btn.getAttribute('data-state') !== 'on_call'
		) {
			updateButton(btn, 'on_call');
		}
	});
}

async function loadParticipants() {
	logger.trace('loadParticipants', ...arguments);
	const localLastStartTime = Date.now();
	lastStartTime = localLastStartTime;

	const participants: ApiConferenceGetResponse = await fetch(`/api/conference?action=get`)
		.then(r => r.json());

	if (participantsLoading.parentElement !== null)
		participantsLoading.parentElement.removeChild(participantsLoading);

	if (!participants.success || typeof participants.data === 'undefined') {
		showAlert('danger', 'Failed to load conference participants');
		return;
	}

	showParticipants(participants.data);

	if (
		lastStartTime === localLastStartTime &&
		((
			myCallSid === '' &&
			Array.from(document.querySelectorAll('.invite-button:not([data-state="can_invite"])')).length > 0
		) ||
		lastParticipants.length > 0)
	) {
		setTimeout(loadParticipants, 5000);
	}
}

async function updateAccessToken(device: twilio.Device) {
	logger.trace('updateAccessToken', ...arguments);
	const tokenResult: ApiConferenceTokenResponse = await fetch(`/api/conference?action=token`)
		.then(r => r.json());
	if (!tokenResult.success || typeof tokenResult.token === 'undefined')
		throw new Error('Failed to update access token');
	device.updateToken(tokenResult.token);
}

async function leaveCall() {
	logger.trace('leaveCall', ...arguments);
	if (call.status() === 'closed') {
		updateButton(startButton, 'join');
		return;
	}

	updateButton(startButton, 'leaving');
	let wasSuccess = false;
	let promiseResolved = false;

	try {
		await new Promise((res, rej) => {
			call.once('disconnect', res);
			call.removeListener('disconnect', leaveCall);
			call.disconnect();
			setTimeout(() => {
				if (promiseResolved) return;
				rej(new Error('timeout'));
			}, 20000);
		});

		showParticipants(lastParticipants.filter(p => p.CallSid !== myCallSid));
		myCallSid = '';
		wasSuccess = true;
	} catch (e) {
		if (typeof e === 'undefined' || e === null)
			showAlert('danger', 'Failed to leave the call');
		else
			showAlert('danger', `Failed to leave - ${(<Error>e).message}`);
	}
	promiseResolved = true;

	updateButton(startButton, wasSuccess ? 'join' : 'leave');
}

async function joinCall() {
	logger.trace('joinCall', ...arguments);
	updateButton(startButton, 'joining');

	let wasSuccess = false;
	let promiseResolved = false;

	try {
		const device = new twilio.Device('', {
			appName: 'fire-watcher-website',
			appVersion: '0.0.2',
		});

		await updateAccessToken(device);
		device.on('tokenWillExpire', updateAccessToken.bind(null, device));

		call = await device.connect({
			params: {
				From: `+1${user.phone}`,
				Type: 'Browser',
			},
		});

		await new Promise((res, rej) => {
			call.once('accept', () => myCallSid = call.parameters.CallSid);
			call.on('messageReceived', message => showParticipants(
				message.content.participants
			));
			call.once('messageReceived', res);
			call.once('disconnect', leaveCall);
			setTimeout(() => {
				if (promiseResolved) return;
				logger.warn('Timed out waiting to join call');
				rej(new Error('timeout'));
			}, 20000);
		});
		wasSuccess = true;
	} catch (e) {
		if (typeof e === 'undefined' || e === null)
			showAlert('danger', 'Failed to start or join the call');
		else
			showAlert('danger', `Failed to start or join - ${(<Error>e).message}`);
	}
	promiseResolved = true;

	updateButton(startButton, wasSuccess ? 'leave' : 'join');
}

const createInviteBtnFn = (btn: HTMLButtonElement, u: UserObject) => async () => {
	logger.trace('inviteBtnFn', btn, u);
	const mode = btn.getAttribute('data-state');
	if (mode !== 'can_invite') return;

	updateButton(btn, 'inviting');

	let wasSuccess = false;
	try {
		const apiResponse = await fetch(`/api/conference?action=invite&phone=${u.phone}`)
			.then(r => r.json());

		if (!apiResponse.success)
			throw new Error(apiResponse.message);
		
		wasSuccess = true;
	} catch (e) {
		showAlert('danger', `Failed to invite user`);
		logger.error('inviteBtnFn', btn, u, e);
	}

	updateButton(btn, wasSuccess ? 'inviting' : 'can_invite');
	const lastDateStart = Date.now().toString();
	btn.setAttribute('data-starttime', lastDateStart);
	setTimeout(loadParticipants, 3000);
	setTimeout(() => {
		const dateStartAttr = btn.getAttribute('data-starttime');
		if (lastDateStart !== dateStartAttr) return;

		const btnState = btn.getAttribute('data-state');
		if (btnState === 'inviting') updateButton(btn, 'can_invite');
	}, 60000);
};

async function createInvitableTable() {
	logger.trace('createInvitableTable', ...arguments);
	const departmentUsers: ApiUserListResponse = await fetch(`/api/user?action=list`)
		.then(r => r.json());
	if (!departmentUsers.success) {
		showAlert('danger', 'Failed to load users that can be invited');
		return;
	}

	await new Promise(res => afterAuthUpdate.push(res));

	const invitableUsers = departmentUsers.users
		.filter(u => u.isActive)
		.sort((a, b) => {
			if (a.lName > b.lName) {
				return 1;
			} else if (a.lName < b.lName) {
				return -1;
			} else if (a.fName > b.fName) {
				return 1;
			} else if (a.fName < b.fName) {
				return 1;
			// } else if (a.callSign > b.callSign) {
			// 	return 1;
			}
			return -1;
		});

	invitableUsers.forEach(u => {
		const existingRow = document.getElementById(`${u.phone}-invite`);
		if (existingRow !== null) return;

		createTableRow(invitableUsersTable, {
			id: `${u.phone}-invite`,
			columns: [
				{
					html: `${u.fName} ${u.lName}`,
				},
				{
					html: formatPhone(u.phone),
				},
				{
					create: td => {
						const inviteBtn = document.createElement('button');
						td.appendChild(inviteBtn);
						inviteBtn.classList.add('btn', 'invite-button');
						inviteBtn.id = `${u.phone}-invite-btn`;
						inviteBtn.setAttribute('data-phone', u.phone);
						inviteBtn.addEventListener('click', createInviteBtnFn(inviteBtn, u));
						updateButton(inviteBtn, 'can_invite');
					},
				},
			]
		});
	});

	showParticipants(lastParticipants);
	invitableUsersContainer.hidden = false;
}

startButton.addEventListener('click', () => {
	logger.trace('startButton.click');
	startButton.blur();
	if (startButton.disabled) return;

	const buttonMode = startButton.getAttribute('data-state');
	if (buttonMode === 'join') {
		joinCall();
	} else if (buttonMode === 'leave') {
		leaveCall();
	}
});
endButton.addEventListener('click', async () => {
	logger.trace('endButton.click');
	updateButton(endButton, 'ending');
	await fetch(`/api/conference?action=end`)
		.then(r => r.json());
	updateButton(endButton, 'end');
});

function init() {
	logger.trace('init', ...arguments);
	updateButton(startButton, 'join');
	updateButton(endButton, 'end');
	loadParticipants();
	if (user.isAdmin)
		createInvitableTable();
}
init();
