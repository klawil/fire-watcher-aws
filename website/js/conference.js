window.afterAuth = window.afterAuth || [];
let device;
let call;

const logType = (type) => function() {
	console.log(type, ...arguments);
}

async function updateAccessToken() {
	await fetch(`${baseHost}/api/user?action=token`)
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
	btn.enabled = enabled;
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
		await fetch(`${baseHost}/api/twilio?action=kickUser&callSid=${encodeURIComponent(callSid)}`)
			.then(r => r.json())
			.then(console.log);
	} catch (e) {
		modifyButton(btn, 'Remove', 'btn-danger', false, true);
		return;
	}

	modifyButton(btn, 'Removed', 'btn-secondary', false, false);
};

function showParticipants({ participants, new: newId, you }) {
	lastParticipants = participants;

	if (participants.length === 0) {
		participantsTable.hidden = true;
		participantsNone.hidden = false;
		return;
	}

	participantsTable.hidden = false;
	participantsNone.hidden = true;
	let validParticipants = [];

	participants.forEach(user => {
		validParticipants.push(user.CallSid);
		const existingRow = document.getElementById(user.CallSid);
		if (
			existingRow !== null &&
			user.CallSid !== newId
		) return;

		if (existingRow !== null) return highlightRow(existingRow);

		const tr = document.createElement('tr');
		tr.id = user.CallSid;
		if (user.CallSid === newId) highlightRow(tr);

		const tdMe = document.createElement('td');
		tdMe.classList.add('text-center');
		if (user.CallSid === you)
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
			tdKick.classList.add('text-center');
			// if (user.CallSid !== you)
				tdKick.appendChild(kickBtn);
			tr.appendChild(tdKick);
		}

		participantsBody.appendChild(tr);
	});

	[ ...participantsBody.querySelectorAll('tr') ].forEach(row => {
		if (validParticipants.includes(row.id)) return;

		row.parentElement.removeChild(row);
	});
}

async function loadParticipants() {
	return fetch(`${baseHost}/api/user?action=getConference`)
		.then(r => r.json())
		.then(data => {
			if (participantsLoading.parentElement !== null)
				participantsLoading.parentElement.removeChild(participantsLoading);
			if (!data.success) return;

			showParticipants({
				participants: data.data,
				new: '',
				you: '',
			});
		});
}

window.afterAuth.push(() => {
	doneLoading();
	loadParticipants();
});

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
	startButton.enabled = enabled;

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

		call.on('messageReceived', message => showParticipants(message.content));
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

		showParticipants({
			participants: lastParticipants.filter(p => p.CallSid !== call.parameters.CallSid),
		});
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

window.afterAuth.push(async () => {
	return;
	
	// console.log(Twilio.Device.isSupported);
	device = new Twilio.Device('', {
		appName: 'fire-watcher-website',
		appVersion: '0.0.1',
		logLevel: 3,
	});

	await updateAccessToken();

	device.on('tokenWillExpire', updateAccessToken);
	device.on('messageReceived', logType('messageReceived - call'))

	call = await device.connect({
		params: {
			From: `+1${user.phone}`,
			Type: 'browser',
		},
	});
	call.on('messageReceived', message => console.log(message.content));
});
