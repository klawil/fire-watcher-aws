// Get the player elements
const player = document.getElementById('player');
const playerButtons = [
	document.getElementById('play-button-m'),
	document.getElementById('play-button-d')
];
const playerDuration = document.getElementById('player-duration');
const playerBar = document.getElementById('player-progress');
const playerBarContainer = document.getElementById('player-progress-container');
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

playerBarContainer.addEventListener('click', (e) => {
	const container = playerBarContainer.getBoundingClientRect();
	let percent = (e.x - container.x) / container.width;
	if (percent < 0) percent = 0;
	if (percent > 1) percent = 1;

	player.currentTime = player.duration * percent;
});

// Add the filtering functionality
const filterModal = document.getElementById('filter-modal');
const filterApplyButton = document.getElementById('filter-apply');
const filterButtons = [
	document.getElementById('filter-button-d'),
	document.getElementById('filter-button-m')
];

if (filterModal) {
	filterApplyButton.addEventListener('click', () => {
		Object.keys(urlFilters)
			.forEach(key => urlFilters[key].update());
		Object.keys(afterFilters)
			.forEach(key => afterFilters[key].update());
		setUrlParams();
		updateData('after', true);
	});
}

class CheckBoxFilter {
	value = [];

	constructor(querySelector) {
		this.elements = [ ...document.querySelectorAll(querySelector) ];
		this.update();
		this.defaultUrl = this.getUrl();
	}

	update() {
		this.value = this.elements
			.filter(checkbox => checkbox.checked)
			.map(checkbox => checkbox.value);
	}

	get() {
		return this.value;
	}

	set(urlValue) {
		const vals = urlValue.split('|');
		this.elements
			.forEach((checkbox) => checkbox.checkbox = vals.indexOf(checkbox.value) !== -1);
		this.update();
	}

	getUrl() {
		return this.value.join('|');
	}

	isDefault() {
		return this.getUrl() === this.defaultUrl;
	}
}

class ToggleFilter {
	value = undefined;

	constructor(id) {
		this.element = document.getElementById(id);
		this.update();
		this.defaultUrl = this.getUrl();
	}

	update() {
		this.value = this.element.checked ? 'y' : undefined;
	}

	get() {
		return this.value;
	}

	set(urlValue) {
		this.element.checked = urlValue === 'y';
		this.update();
	}

	getUrl() {
		return `${this.value}`;
	}

	isDefault() {
		return this.getUrl() === this.defaultUrl;
	}
}

// Data fetch configuration
const afterFilters = {};
const urlFilters = {};
let files = [];
const fileTable = document.getElementById('files');
let fileKeyField = 'File';
let rowConfig = [];
let defaultFunc = () => {};
let isInit = true;
const doStart = window.location.href.indexOf('nostart') === -1;

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

function display(dataToDisplay, location, restart) {
	if (!doStart) return;

	if (restart) {
		fileTable.innerHTML = '';
	}

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
			play(f);
			scrollRowIntoView(f);
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
	lastUpdateId.after = Date.now();
	setTimeout(() => lastUpdateId.after = null, 2000);
	window.scrollTo({
		left: 0,
		top: newScroll
	});
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
	return data.filter(f => Object.keys(afterFilters)
		.reduce((keep, key) => {
			const value = afterFilters[key].get();
			if (
				!keep ||
				value === null
			) return keep;

			if (typeof value === 'string') {
				return value === f[key];
			}

			if (Array.isArray(value)) {
				return value.indexOf(f[key]) !== -1;
			}

			if (typeof value === 'function') {
				return value(f[key], f);
			}

			console.log(`INVALID FILTER - ${key}`);
			return false;
		}, true));
}

// Functions for dealing with the URL
const defaultFilterValues = {};
function init() {
	// Layer on the URL parameters
	const urlParams = getUrlParams();
	Object.keys(urlParams)
		.forEach((param) => {
			if (typeof afterFilters[param] !== 'undefined') {
				afterFilters[param].set(urlParams[param]);
			}

			if (typeof urlFilters[param] !== 'undefined') {
				urlFilters[param].set(urlParams[param]);
			}
		});

	setUrlParams();
	updateData('after', true);
}

function getUrlParams() {
	return window.location.search
		.slice(1)
		.split('&')
		.reduce((agg, str) => {
			const values = str.split('=')
				.map((v) => decodeURIComponent(v));
			try {
				agg[values[0]] = JSON.parse(values[1]);
			} catch (e) {
				agg[values[0]] = values[1];
			}

			return agg;
		}, {});
}

function setUrlParams() {
	const newParams = {
		...getUrlParams()
	};
	delete newParams.nostart;
	Object.keys(urlFilters)
		.forEach((filterKey) => {
			newParams[filterKey] = urlFilters[filterKey].getUrl();
		});
	Object.keys(afterFilters)
		.forEach((filterKey) => {
			newParams[filterKey] = afterFilters[filterKey].getUrl();
		});

	const newSearch = Object.keys(newParams)
		.sort()
		.filter((key) =>
			(
				!urlFilters.hasOwnProperty(key) ||
				!urlFilters[key].isDefault()
			) &&
			(
				!afterFilters.hasOwnProperty(key) ||
				!afterFilters[key].isDefault()
			) &&
			key !== ''
		)
		.map((key) => {
			let str = JSON.stringify(newParams[key]);
			if (typeof newParams[key] === 'string' || typeof newParams[key] === 'undefined') {
				str = newParams[key];
			}

			return `${encodeURIComponent(key)}=${encodeURIComponent(str)}`;
		})
		.join('&');

	if (newSearch !== window.location.search.slice(1)) {
		history.pushState(null, null, `?${newSearch}`);
	}
}

// Allow functions to be run on init
window.audioQ = window.audioQ || [];
window.audioQ.forEach(f => f());
window.audioQ.push = f => f();
