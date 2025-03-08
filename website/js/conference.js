window.afterAuth = window.afterAuth || [];
let device;
let call;

const logType = (type) => function() {
	console.log(type, ...arguments);
}

async function updateAccessToken() {
	await fetch(`${baseHost}/api/conference?action=token`)
		.then(r => r.json())
		.then(data => {
			if (!data.success) throw new Error(`Invalid token response: ${data.message}`);

			device.updateToken(data.token);
		});
}

const participantsTable = document.getElementById('participantsTable');
const participantsNone = document.getElementById('participantsNone');
const participantsLoading = document.getElementById('participantsLoading');
const participantsBody = document.getElementById('participants');

let lastParticipants = [];

function highlightRow(row) {
	setTimeout(() => row.classList.add('bg-opacity-50', 'bg-success'), 1000);
	setTimeout(() => row.classList.remove('bg-success', 'bg-opacity-50'), 3000);
}

function modifyButton(btn, text, className, spinner, enabled) {
	btn.classList.remove('btn-danger', 'btn-secondary');
	btn.classList.add(className);
	btn.disabled = !enabled;
	btn.innerHTML = '';

	if (spinner) {
		const spinDiv = document.createElement('div');
		spinDiv.classList.add('spinner-border', 'spinner-border-sm');
		btn.appendChild(spinDiv);
		text = ` ${text}`;
	}

	btn.innerHTML += text;
}

const kickUser = (btn, callSid) => async () => {
	modifyButton(btn, 'Removing...', 'btn-secondary', true, false);

	try {
		await fetch(`${baseHost}/api/conference?action=kickUser&callSid=${encodeURIComponent(callSid)}`)
			.then(r => r.json())
			.then(console.log);
	} catch (e) {
		modifyButton(btn, 'Remove', 'btn-danger', false, true);
		return;
	}

	modifyButton(btn, 'Removed', 'btn-secondary', false, false);
};

let myCallSid = '';
let lastStartTime;

function showParticipants(participants) {
	const lastParticipantsIds = lastParticipants.map(u => u.CallSid);
	lastParticipants = participants;
	let validParticipants = [];
	let inMeetingCallsign = [];

	if (participants.length === 0) {
		participantsTable.hidden = true;
		participantsNone.hidden = false;
	} else {
		participantsTable.hidden = false;
		participantsNone.hidden = true;

		participants.forEach(user => {
			validParticipants.push(user.CallSid);
			inMeetingCallsign.push(user.CallSign);
			const existingRow = document.getElementById(user.CallSid);
			if (
				existingRow !== null &&
				lastParticipantsIds.includes(user.CallSid)
			) return;

			if (existingRow !== null) return highlightRow(existingRow);

			const tr = document.createElement('tr');
			tr.id = user.CallSid;
			if (!lastParticipantsIds.includes(user.CallSid))
				highlightRow(tr);

			const tdMe = document.createElement('td');
			if (user.CallSid === myCallSid)
				tdMe.innerHTML = 'Me';
			tr.appendChild(tdMe);

			const tdName = document.createElement('td');
			tdName.innerHTML = `${user.FirstName} ${user.LastName} (${user.CallSign})`;
			tr.appendChild(tdName);

			const tdDevice = document.createElement('td');
			tdDevice.innerHTML = `${user.Type.slice(0, 1).toUpperCase()}${user.Type.slice(1)}`;
			tr.appendChild(tdDevice);

			if (window.user.isAdmin) {
				const kickBtn = document.createElement('button');
				kickBtn.classList.add('btn', 'btn-danger');
				kickBtn.innerHTML = 'Remove';
				kickBtn.addEventListener('click', kickUser(kickBtn, user.CallSid));

				const tdKick = document.createElement('td');
				tdKick.appendChild(kickBtn);
				tr.appendChild(tdKick);
			}

			participantsBody.appendChild(tr);
		});
	}

	[ ...participantsBody.querySelectorAll('tr') ].forEach(row => {
		if (validParticipants.includes(row.id)) return;

		row.parentElement.removeChild(row);
	});

	[ ...invitableUsersTable.querySelectorAll('.invite-button') ].forEach(btn => {
		const callSign = parseInt(btn.getAttribute('data-callsign', 10));
		if (
			!inMeetingCallsign.includes(callSign) &&
			btn.getAttribute('data-state') === 'on_call'
		) {
			updateInviteButton(btn, 'can_invite');
		} else if (
			inMeetingCallsign.includes(callSign) &&
			btn.getAttribute('data-state') !== 'on_call'
		) {
			updateInviteButton(btn, 'on_call');
		}
	});
}

async function loadParticipants() {
	const localLastStartTime = Date.now();
	lastStartTime = localLastStartTime;

	return fetch(`${baseHost}/api/conference?action=get`)
		.then(r => r.json())
		.then(data => {
			if (participantsLoading.parentElement !== null)
				participantsLoading.parentElement.removeChild(participantsLoading);
			if (!data.success) return;

			showParticipants(data.data);
			if (
				lastStartTime === localLastStartTime &&
				myCallSid === '' &&
				[ ...document.querySelectorAll('.invite-button:not([data-state="can_invite"])') ].length > 0
			) {
				setTimeout(loadParticipants, 5000);
			}
		});
}

let buttonMode = 'join';
let joinOrLeaveInProgress = false;
const startButton = document.getElementById('startButton');

const buttonConfigs = {
	joining: {
		className: 'btn-secondary',
		innerText: 'Joining...',
		enabled: false,
		spinner: true,
	},
	leaving: {
		className: 'btn-secondary',
		innerText: 'Leaving...',
		enabled: false,
		spinner: true,
	},
	join: {
		className: 'btn-success',
		innerText: 'Start or Join Call',
		enabled: true,
		spinner: false,
	},
	leave: {
		className: 'btn-danger',
		innerText: 'Leave Call',
		enabled: true,
		spinner: false,
	},
};
function formatButton(mode) {
	joinOrLeaveInProgress = [ 'leaving', 'joining' ].includes(mode);
	buttonMode = mode;

	const { className, innerText, enabled, spinner } = buttonConfigs[mode];

	startButton.classList.remove('btn-success', 'btn-danger', 'btn-secondary');
	startButton.classList.add(className);
	startButton.innerHTML = '';
	startButton.disabled = !enabled;

	if (spinner) {
		const spinDiv = document.createElement('div');
		spinDiv.classList.add('spinner-border', 'spinner-border-sm');
		startButton.appendChild(spinDiv);
	}

	startButton.innerHTML += (spinner ? ' ' : '') + innerText;
}
formatButton('join');

async function joinCall() {
	formatButton('joining');

	let wasSuccess = false;
	let promiseResolved = false;

	try {
		device = new Twilio.Device('', {
			appName: 'fire-watcher-website',
			appVersion: '0.0.1',
		});

		await updateAccessToken();
		device.on('tokenWillExpire', updateAccessToken);

		call = await device.connect({
			params: {
				From: `+1${user.phone}`,
				Type: 'Browser',
			},
		});

		let donePromise;
		let errPromise;
		const promise = new Promise((res, rej) => {
			donePromise = res;
			errPromise = rej;
		});

		call.once('accept', () => myCallSid = call.parameters.CallSid);
		call.on('messageReceived', message => showParticipants(
			message.content.participants
		));
		call.once('messageReceived', donePromise);
		call.once('disconnect', leaveCall);
		setTimeout(() => !promiseResolved && errPromise(new Error('timeout')), 10000);
	
		await promise;
		wasSuccess = true;
	} catch (e) {
		console.error(e);
	}
	promiseResolved = true;

	formatButton(wasSuccess ? 'leave' : 'join');
}

async function leaveCall() {
	formatButton('leaving');
	let wasSuccess = false;
	let promiseResolved = false;

	try {
		if (call.status() !== 'closed') {
			let donePromise;
			let errPromise;
			const promise = new Promise((res, rej) => {
				donePromise = res;
				errPromise = rej;
			});

			call.once('disconnect', donePromise);
			call.removeListener('disconnect', leaveCall);
			call.disconnect();
			setTimeout(() => !promiseResolved && errPromise(new Error('timeout')), 2000);
			await promise;
		}

		showParticipants(lastParticipants.filter(p => p.CallSid !== myCallSid));
		myCallSid = '';
		wasSuccess = true;
	} catch (e) {
		console.error(e);
	}
	promiseResolved = true;

	formatButton(wasSuccess ? 'join' : 'leave');
}

startButton.addEventListener('click', async () => {
	startButton.blur();
	if (joinOrLeaveInProgress) return;
	joinOrLeaveInProgress = true;
	if (buttonMode === 'join') {
		joinCall();
		return;
	} else if (buttonMode === 'leave') {
		leaveCall();
		return;
	}
	console.error(`Invalid button mode: ${buttonMode}`);
});

let invitableUsers = [];
const invitableUsersContainer = document.getElementById('addMembersContainer');
const invitableUsersTable = document.getElementById('invitableUsers');

const inviteBtnConfig = {
	'on_call': {
		text: 'Already In',
	},
	'inviting': {
		text: 'Calling...',
		spinner: true,
	},
	'can_invite': {
		text: 'Invite',
		enabled: true,
		className: 'btn-success',
	},
};
function updateInviteButton(btn, state) {
	const {
		text,
		enabled = false,
		className = 'btn-secondary',
		spinner = false,
	} = inviteBtnConfig[state];

	btn.classList.remove('btn-success', 'btn-danger', 'btn-secondary');
	btn.classList.add(className);
	btn.innerHTML = '';
	btn.disabled = !enabled;
	btn.setAttribute('data-state', state);

	if (spinner) {
		const spinDiv = document.createElement('div');
		spinDiv.classList.add('spinner-border', 'spinner-border-sm');
		btn.appendChild(spinDiv);
	}

	btn.innerHTML += (spinner ? ' ' : '') + text;
}

async function inviteButtonClick(btn) {
	const mode = btn.getAttribute('data-state');
	if (mode !== 'can_invite') return;

	updateInviteButton(btn, 'inviting');

	let wasSuccess = false;
	try {
		const apiResponse = await fetch(`${baseHost}/api/conference?action=invite&phone=${btn.getAttribute('data-phone')}`)
			.then(r => r.json());
		
		wasSuccess = apiResponse.success;
	} catch (e) {
		console.error(e);
	}
	updateInviteButton(btn, wasSuccess ? 'inviting' : 'can_invite');
	const lastDateStart = Date.now().toString();
	btn.setAttribute('data-starttime', lastDateStart);
	setTimeout(loadParticipants, 3000);
	setTimeout(() => {
		const dateStartAttr = btn.getAttribute('data-starttime');
		if (lastDateStart !== dateStartAttr) return;

		const btnState = btn.getAttribute('data-state');
		if (btnState === 'inviting') updateInviteButton(btn, 'can_invite');
	}, 60000);
}

function showInvitableTable() {
	invitableUsers
		.sort((a, b) => {
			if (a.lName > b.lName) {
				return 1;
			} else if (a.lName < b.lName) {
				return -1;
			} else if (a.fName > b.fName) {
				return 1;
			} else if (a.fName < b.fName) {
				return -1;
			} else if (a.callSign > b.callSign) {
				return 1;
			}
			return -1;
		})
		.forEach(u => {
			const existingRow = document.getElementById(`${u.callSign}-invite`);
			if (existingRow !== null) return;

			const tr = document.createElement('tr');
			tr.id = `${u.callSign}-invite`;

			const nameTd = document.createElement('td');
			nameTd.innerHTML = `${u.fName} ${u.lName} (${u.callSign})`;
			tr.appendChild(nameTd);

			const phoneTd = document.createElement('td');
			phoneTd.innerHTML = u.phone.toString().replace(/(\d{3})(\d{3})(\d{4})$/g, (a, b, c, d) => `${b}-${c}-${d}`);
			tr.appendChild(phoneTd);

			const inviteBtn = document.createElement('button');
			inviteBtn.classList.add('btn', 'invite-button');
			inviteBtn.id = `${u.callSign}-invite-btn`;
			inviteBtn.setAttribute('data-callsign', u.callSign);
			inviteBtn.setAttribute('data-phone', u.phone);
			inviteBtn.addEventListener('click', () => inviteButtonClick(inviteBtn));
			updateInviteButton(inviteBtn, 'can_invite');

			const btnTd = document.createElement('td');
			btnTd.appendChild(inviteBtn);
			tr.appendChild(btnTd);

			invitableUsersTable.appendChild(tr);
		});

	showParticipants(lastParticipants);

	invitableUsersContainer.hidden = false;
}

window.afterAuth.push(() => {
	doneLoading();
	loadParticipants();
	if (user.isAdmin) {
		fetch(`${baseHost}/api/user?action=list`)
			.then(r => r.json())
			.then(data => data.users)
			.then(users => users.filter(u => u.department === user.department))
			.then(users => {
				invitableUsers = users;
				showInvitableTable();
			});
	}
});
