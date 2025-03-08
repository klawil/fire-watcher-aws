// Get the player elements
const player = document.getElementById('player');
const playerProgress = document.getElementById('player-progress');
const playerButtons = [
	document.getElementById('play-button-m'),
	document.getElementById('play-button-d')
];
const playerDuration = document.getElementById('player-duration');
const playerBar = document.getElementById('player-progress');
const autoPlayButtons = [
	document.getElementById('autoplay-button-d'),
	document.getElementById('autoplay-button-m')
];

// Control variables
let playNewFiles = false;
let autoPlayEnabled = true;
let playButtonAction = 'play';

// Add the button event handlers
playerButtons.forEach((button) => button.addEventListener('click', (btn) => {
	button.blur();
	if (playButtonAction === 'play') {
		player.play();
	} else {
		player.pause();
	}
}));

autoPlayButtons.forEach((button) => button.addEventListener('click', () => {
	autoPlayEnabled = !autoPlayEnabled;
	const method = autoPlayEnabled ? 'add' : 'remove';

	autoPlayButtons.forEach((button) => {
		if (button.tagName === 'LI') {
			button.querySelector('a').classList[method]('active');
		} else {
			button.blur();
			button.classList[method]('player-active');
		}
	});
}));

// Add the player event handlers
player.addEventListener('durationchange', () => playerDuration.innerHTML = `${Math.round(player.duration)}`);

player.addEventListener('play', () => {
	playButtonAction = 'pause';
	playerButtons.forEach((button) => {
		const bi = button.querySelector('.bi');
		bi.classList.add('bi-pause-fill');
		bi.classList.remove('bi-play-fill');
	});
});

player.addEventListener('pause', () => {
	playButtonAction = 'play';
	playerButtons.forEach((button) => {
		const bi = button.querySelector('.bi');
		bi.classList.add('bi-play-fill');
		bi.classList.remove('bi-pause-fill');
	});
});

player.addEventListener('timeupdate', () => {
	const newPercent = Math.round(player.currentTime * 100 / player.duration);
	playerBar.style.width = `${newPercent}%`;
});

player.addEventListener('ended', () => {
	if (!player.file) return;
	if (!autoPlayEnabled) return;

	const index = getFileIndex(player.file);
	if (index < 1) {
		playNewFiles = true;
		return;
	}

	play(files[index - 1][fileKeyField]);
});

document.getElementById('latest-button-m').addEventListener('click', (e) => {
	document.getElementById('latest-button-m').blur();
	defaultFunc();
});
document.getElementById('latest-button-d').addEventListener('click', () => defaultFunc());

// Data fetch configuration
const filters = {};
let files = [];
const fileTable = document.getElementById('files');
let fileKeyField = 'File';
let rowConfig = [];
let defaultFunc = () => {};
let isInit = true;

// Display utilities
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

function getFileIndex(file) {
	return files.reduce(
		(i, f, index) => f[fileKeyField] === file
			? index
			: i,
		-1
	);
}

function display(dataToDisplay, location) {
	let addRowToFiles = (row) => fileTable.appendChild(row);
	if (location === 'after' && fileTable.childElementCount > 0) {
		dataToDisplay.reverse();
		addRowToFiles = (row) => {
			const firstElem = fileTable.firstChild;
			fileTable.insertBefore(row, firstElem);
		};
	}

	dataToDisplay
		.map((file) => {
			const row = document.createElement('tr');
			row.setAttribute('id', file[fileKeyField]);
			row.addEventListener('click', play.bind(null, file[fileKeyField]));

			rowConfig.forEach((conf, i) => {
				const td = document.createElement('td');
				td.innerHTML = conf(file);
				if (i === 1) td.classList.add('text-start');
				row.appendChild(td);
			});

			addRowToFiles(row);
		});

	if (player.file) {
		const index = getFileIndex(player.file);
		if (playNewFiles && autoPlayEnabled && index > 0) {
			play(files[index - 1][fileKeyField]);
		}
	}

	if (isInit) {
		isInit = false;
		const f = new URL(window.location.href).searchParams.get('f');
		if (f !== null && document.getElementById(f) !== null) {
			scrollRowIntoView(f);
			play(f);
		} else {
			defaultFunc();
		}
	}
}

function play(file) {
	const data = files.filter((f) => f[fileKeyField] === file)[0];
	if (typeof data === 'undefined') return;

	playNewFiles = false;
	player.file = file;

	player.src = `https://fire.klawil.net/${data.Key}`;
	player.play();

	markRowAsPlaying(file);

	setParams({
		f: data[fileKeyField]
	});
}

// Misc utility functions
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

function scrollRowIntoView(f) {
	const elemToScrollTo = document.getElementById(f);
	const elemRect = elemToScrollTo.getBoundingClientRect();
	const winTop = window.scrollY + 80;
	const winBottom = window.scrollY + window.innerHeight - 80;
	if (
		elemRect.top >= winTop &&
		elemRect.bottom <= winBottom
	) return;

	const newScroll = window.scrollY + elemToScrollTo.getBoundingClientRect().top - 80;
	window.scrollTo(0, newScroll);
}

function markRowAsPlaying(file) {
	[ ...document.querySelectorAll('tr') ]
		.forEach((row) => row.classList.remove('table-success'));

	const playingRow = document.getElementById(file);
	if (playingRow !== null) {
		playingRow.classList.add('table-success');
	}
}

function padLeft(value) {
	return value.toString().padStart(2, '0');
}

function secondsToString(seconds) {
	if (typeof seconds === 'undefined' || seconds === null) {
		return '';
	}

	return `${seconds}s`;
}

function filterData(data) {
	return data.filter(f => Object.keys(filters)
		.reduce((keep, key) => {
			if (
				!keep ||
				filters[key] === null
			) return keep;

			if (typeof filters[key] === 'string') {
				return filters[key] === f[key];
			}

			if (Array.isArray(filters[key])) {
				return filters[key].indexOf(f[key]) !== -1;
			}

			if (typeof filters[key] === 'function') {
				return filters[key](f[key], f);
			}

			console.log(`INVALID FILTER - ${key}`);
			return false;
		}, true));
}

// Allow functions to be run on init
window.audioQ = window.audioQ || [];
window.audioQ.forEach(f => f());
window.audioQ.push = f => f();
