let files = [];
const dataUpdateFrequency = 10000;
const sourceMap = {
	BG_FIRE_VHF: 'Baca Fire VHF',
	SAG_FIRE_VHF: 'Saguache Fire VHF'
};
const allowedSources = [
	'SAG_FIRE_VHF'
];

function dateToStr(d) {
	let dateString = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
	let timeString = [
		d.getHours(),
		d.getMinutes(),
		d.getSeconds()
	]
		.map((n) => n.toString().padStart(2, '0'))
		.join(':');

	return `${dateString} ${timeString}`;
}

function updateData() {
	fetch('/api')
		.then((r) => r.json())
		.then((r) => r.data.map((f) => ({
			...f,
			Local: dateToStr(new Date(f.Datetime)),
			File: f.Key.split('/')[1]
		})))
		.then((r) => r.sort((a, b) => a.Datetime > b.Datetime ? -1 : 1))
		.then((data) => {
			files = data;
			display();
		})
		.catch(console.error)
		.then(() => setTimeout(updateData, dataUpdateFrequency));
}

updateData();

function getFileIndex(file) {
	return files.reduce(
		(i, f, index) => f.File === file
			? index
			: i,
		-1
	);
}

function padLeft(value) {
	return value.toString().padStart(2, '0');
}

function secondsToString(seconds) {
	if (typeof seconds === 'undefined' || seconds === null) {
		return '';
	}

	const hours = Math.floor(seconds / 3600);
	seconds -= (hours * 3600);
	const minutes = Math.floor(seconds / 60);
	seconds -= (minutes * 60);
	seconds = Math.round(seconds);
	return `${padLeft(hours)}:${padLeft(minutes)}:${padLeft(seconds)}`;
}

function isInView(row) {
	const container = document.getElementById('container');
	const rec1 = row.getBoundingClientRect();
	const rec2 = container.getBoundingClientRect();

	if (
		rec1.y + rec1.height >= rec2.y + rec2.height ||
		rec1.y < rec2.y
	) {
		return false;
	}
	return true;
}

function markRowAsPlaying(file) {
	[ ...document.querySelectorAll('tr') ]
		.forEach((row) => row.classList.remove('playing'));

	document.getElementById(file).classList.add('playing');
}

let isInit = true;
function display() {
	const rows = files
		.filter((file) => allowedSources.indexOf(file.Source) !== -1)
		.map((file) => [
			file.Local,
			sourceMap[file.Source] || file.Source,
			secondsToString(file.Len),
			file.Tone ? 'TONE' : '',
			`<button class="btn btn-success" onclick="play('${file.File}');">Play</button>`
		]
			.map((cell) => `<td>${cell}</td>`)
			.join(''))
		.map((row, index) => `<tr id="${files[index].File}">${row}</tr>`)
		.join('\n');

	document.getElementById('files').innerHTML = rows;

	if (player.file) {
		const index = getFileIndex(player.file);
		if (playNewFiles && index > 1) {
			play(files[index - 1].File);
		} else {
			markRowAsPlaying(player.file);
		}
	}

	if (isInit) {
		isInit = false;
		let u = new URL(window.location.href);
		let f = u.searchParams.get('f');
		if (f !== null) {
			play(f);
			document.getElementById(f).scrollIntoView();
		} else {
			playLastTone();
		}
	}
}

let player = document.getElementById('player');
let timestamp = document.getElementById('timestamp');
let playNewFiles = false;

player.addEventListener('ended', async () => {
	if (!player.file) {
		return;
	}

	const index = getFileIndex(player.file);
	if (index < 1) {
		playNewFiles = true;
		return;
	}

	play(files[index - 1].File);
});

function play(file) {
	const data = files.filter((f) => f.File === file)[0];
	if (typeof data === 'undefined') {
		return;
	}

	player.file = file;
	timestamp.innerHTML = data.Local;

	player.src = `/${data.Key}`;
	player.play();

	markRowAsPlaying(file);

	setParams({
		f: data.File
	});
}

function setParams(toSet) {
	let currentParams = document.location.search.slice(1)
		.split('&')
		.filter((v) => v !== '')
		.reduce((p, v) => {
			v = v.split('=');
			if (v.length < 2) {
				v.push('');
			}

			return {
				...p,
				[decodeURIComponent(v[0])]: decodeURIComponent(v[1])
			}
		}, {});

	let newParams = {
		...currentParams,
		...toSet
	};

	let newString = Object.keys(newParams)
		.sort()
		.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(newParams[key])}`)
		.join('&');
	if (newString !== '') {
		newString = `?${newString}`;
	}

	if (document.location.search !== newString) {
		history.replaceState(null, null, newString);
	}
}

function playLastTone() {
	let lastTone = files.filter((file) => file.Tone)[0];

	if (lastTone) {
		play(lastTone.File);
		document.getElementById(lastTone.File).scrollIntoView();
	}
}
