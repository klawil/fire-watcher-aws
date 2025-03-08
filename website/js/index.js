const dataUpdateFrequency = 10000;
const sourceMap = {
	SAG_FIRE_VHF: 'Saguache Fire VHF',
	BG_FIRE_VHF: 'Baca Fire/EMS VHF'
};

const nextDataFields = {};

let isUpdatingBefore = false;
function updateData(direction = 'after') {
	const host = window.location.origin.indexOf('localhost') !== -1
		? 'http://localhost:8001'
		: '';
	let apiUrl = `${host}/api`;
	if (typeof nextDataFields.after !== 'undefined') {
		apiUrl += '?'
		if (direction === 'after') {
			apiUrl += `after=${nextDataFields.after}`;
		} else {
			isUpdatingBefore = true;
			apiUrl += `before=${nextDataFields.before}&continue=${encodeURIComponent(nextDataFields.continue)}`
		}
	}
	fetch(apiUrl)
		.then((r) => r.json())
		.then((r) => {
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
			display(filterData(r.data), direction);
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

function playLastTone() {
	let lastTone = files.filter((file) => file.Tone)[0];

	if (lastTone) {
		play(lastTone.File);
		scrollRowIntoView(lastTone.File);
	}
}

window.addEventListener('scroll', () => {
	if (isUpdatingBefore) return;

	const scrollY = window.scrollY;
	const winHeight = window.innerHeight;
	const bodyHeight = document.body.getBoundingClientRect().height;

	if (scrollY + winHeight >= bodyHeight - 60) {
		updateData('before');
	}
});

window.audioQ = window.audioQ || [];
window.audioQ.push(() => {
	filters.Source = [ 'SAG_FIRE_VHF' ];
	rowConfig = [
		f => secondsToString(f.Len),
		f => sourceMap[f.Source] || f.Source,
		f => f.Local,
		f => f.Tone ? '<i class="bi bi-star-fill"></i>' : ''
	];
	defaultFunc = playLastTone;
	
	updateData();
});
