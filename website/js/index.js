let lastUpdateId = {
	before: null,
	after: null
};
let allowUpdateAfter = true;
const dataUpdateFrequency = 10000;
const sourceMap = {
	SAG_FIRE_VHF: 'Saguache Fire VHF',
	BG_FIRE_VHF: 'Baca Fire/EMS VHF'
};

const nextDataFields = {};

let isUpdatingBefore = false;
function updateData(direction = 'after', restart = false) {
	const updateId = Date.now();

	if (restart) {
		delete nextDataFields.after;
		delete nextDataFields.before;
		delete nextDataFields.continue;
		lastUpdateId.before = null;
		lastUpdateId.after = null;
	}

	if (lastUpdateId[direction] !== null) return;
	lastUpdateId[direction] = updateId;

	const host = window.location.origin.indexOf('localhost') !== -1
		? 'http://localhost:8001'
		: '';
	let apiUrl = `${host}/api`;
	let isAppended = false;
	if (typeof nextDataFields.after !== 'undefined') {
		isAppended = true;
		apiUrl += '?'
		if (direction === 'after') {
			apiUrl += `after=${nextDataFields.after}`;
		} else {
			isUpdatingBefore = true;
			apiUrl += `before=${nextDataFields.before}&continue=${encodeURIComponent(nextDataFields.continue)}`
		}
	}

	const queryParams = Object.keys(urlFilters)
		.filter((filterKey) => urlFilters[filterKey].get())
		.map((filterKey) => `${encodeURIComponent(filterKey)}=${encodeURIComponent(urlFilters[filterKey].getUrl())}`);
	if (queryParams.length > 0) {
		apiUrl += `${isAppended ? '&' : '?'}${queryParams.join('&')}`;
	}

	fetch(apiUrl)
		.then((r) => r.json())
		.then((r) => {
			if (lastUpdateId[direction] !== updateId) return;
			lastUpdateId[direction] = null;

			if (
				r.before &&
				(
					!nextDataFields.before ||
					nextDataFields.before > r.before
				)
			) {
				nextDataFields.before = r.before;
				nextDataFields.continue = r.continueToken;
			}

			if (
				r.after &&
				(
					!nextDataFields.after ||
					nextDataFields.after < r.after
				)
			) {
				nextDataFields.after = r.after;
			}

			r.data = r.data.map((f) => ({
				...f,
				Local: dateToStr(new Date(f.Datetime)),
				File: f.Key.split('/').pop()
			}));
			if (direction === 'before') {
				files = [
					...files,
					...r.data
				];
			} else {
				files = [
					...r.data,
					...files
				];
			}
			files = filterData(files);
			display(filterData(r.data), direction, restart);
		})
		.catch(console.error)
		.then(() => {
			if (direction === 'after') {
				setTimeout(updateData, dataUpdateFrequency, 'after');
			} else {
				isUpdatingBefore = false;
			}
		});
}
setInterval(() => {
	if (allowUpdateAfter || playNewFiles) updateData('after');
}, dataUpdateFrequency);

function playLastTone() {
	let lastTone = files.filter((file) => file.Tone)[0];

	if (lastTone) {
		play(lastTone.File);
		scrollRowIntoView(lastTone.File);
	}
}

window.addEventListener('scroll', () => {
	const scrollY = window.scrollY;
	const winHeight = window.innerHeight;
	const bodyHeight = document.body.getBoundingClientRect().height;
	allowUpdateAfter = false;

	if (scrollY + winHeight >= bodyHeight - 60) {
		updateData('before');
	} else if (scrollY <= 60) {
		allowUpdateAfter = true;
		updateData('after');
	}
});

window.audioQ = window.audioQ || [];
window.audioQ.push(() => {
	afterFilters.Source = new CheckBoxFilter('input[name="vhf-source"]');
	urlFilters.tone = new ToggleFilter('only-pages');

	rowConfig = [
		f => f.Len,
		f => sourceMap[f.Source] || f.Source,
		f => f.Local,
		f => f.Tone ? '<i class="bi bi-star-fill"></i>' : ''
	];
	defaultFunc = playLastTone;
	
	init();
});
