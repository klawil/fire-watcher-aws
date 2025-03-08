const dataUpdateFrequency = 10000;
window.talkgroupMap = window.talkgroupMap || {};

const nextDataFields = {};

let isUpdatingBefore = false;
function updateData(direction = 'after', restart = false) {
	if (restart) {
		delete nextDataFields.after;
		delete nextDataFields.before;
		delete nextDataFields.continue;
	}

	const host = window.location.origin.indexOf('localhost') !== -1
		? 'http://localhost:8001'
		: '';
	let apiUrl = `${host}/api?action=dtr`;
	if (typeof nextDataFields.after !== 'undefined') {
		apiUrl += '&'
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
		apiUrl += `&${queryParams.join('&')}`;
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
				Local: dateToStr(new Date(f.StartTime * 1000)),
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

function playLive() {
	play(files[0].File);
	scrollRowIntoView(files[0].File);
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

class TalkgroupFilter {
	allToggleId = 'all-tgs';
	containerId = 'tg-selected-div';
	selectId = 'tg-select';
	selected = [];

	constructor() {
		this.allToggleEl = document.getElementById(this.allToggleId);
		this.containerEl = document.getElementById(this.containerId);
		this.selectEl = document.getElementById(this.selectId);

		this.hideSelect();

		this.allToggleEl.addEventListener('change', () => {
			if (this.allToggleEl.checked) this.hideSelect();
			else this.showSelect();
		});
	}

	hideSelect() {
		this.allToggleEl.checked = true;
		this.containerEl.innerHTML = '';
		this.selected = [];
		this.selectEl.style.display = 'none';
	}

	showSelect() {
		this.allToggleEl.checked = false;
		this.containerEl.innerHTML = '';
		this.selectEl.style.display = 'block';
	}

	get() {
		this.selected = [ ...this.selectEl.selectedOptions ]
			.map((elem) => elem.value)
			.filter((val) => val !== 'ALL');
		return this.allToggleEl.checked || this.selected.length === 0 ? undefined : this.selected;
	}

	set(urlValue) {
		console.log(urlValue);
		const values = urlValue.toString().split('|');
		console.log(values);
		if (values.length === 0) {
			this.hideSelect();
			return;
		}

		this.showSelect();
		[ ...this.selectEl.options ]
			.forEach((elem) => elem.selected = values.indexOf(elem.value) !== -1);
	}

	getUrl() {
		const value = this.get();
		if (typeof value === 'undefined') {
			return;
		}

		return value.join('|');
	}

	isDefault() {
		return this.allToggleEl.checked || this.selected.length === 0;
	}
}

window.audioQ = window.audioQ || [];
window.audioQ.push(() => {	
	urlFilters.tg = new TalkgroupFilter();
	urlFilters.emerg = new ToggleFilter('only-emerg');
	
	rowConfig = [
		f => f.Len,
		f => talkgroupMap[f.Talkgroup] || f.Talkgroup,
		f => f.Local,
		f => f.Emergency === 1 ? '<i class="bi bi-star-fill"></i>' : ''
	];
	defaultFunc = playLive;
	
	init();
});
