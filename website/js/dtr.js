const dataUpdateFrequency = 10000;
window.talkgroupMap = window.talkgroupMap || {};

const nextDataFields = {};

let isUpdatingBefore = false;
let updatingId = 0;
let nextTimeout = null;
function updateData(direction = 'after', restart = false) {
	if (nextTimeout !== null) clearTimeout(nextTimeout);

	updatingId++;
	if (updatingId > 1000) updatingId = 0;
	const thisUpdatingId = updatingId;

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
		.map((filterKey) => `${encodeURIComponent(filterKey)}=${encodeURIComponent(urlFilters[filterKey].getUrl(true))}`);
	if (queryParams.length > 0) {
		apiUrl += `&${queryParams.join('&')}`;
	}

	fetch(apiUrl)
		.then((r) => r.json())
		.then((r) => {
			if (thisUpdatingId !== updatingId) return console.log('Exit early');

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
			if (direction === 'after' && thisUpdatingId === updatingId) {
				nextTimeout = setTimeout(updateData, dataUpdateFrequency, 'after');
			} else if (direction !== 'after') {
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
	activeTab = 'all';
	chosenPreset = null;
	chosenTalkgroups = [];

	presets = {
		'NSCAD': [ 8198 ],
		'NSCFPD': [ 8330, 8332, 8333 ],
		'BGFD/BGEMS': [ 8090, 8331 ],
		'Saguache SO': [ 8335, 8336 ],
		'NSCAD and NSCFPD': [ 8198, 8330, 8332, 8333 ],
		'SC All': [ 8090, 8198, 8330, 8331, 8332, 8333, 8335, 8336 ],
		'SC All (no ARCC 5)': [ 8198, 8330, 8331, 8332, 8333, 8335, 8336 ],
	};

	constructor() {
		const tabs = [
			'all',
			'presets',
			'talkgroups'
		];

		this.tabButtons = tabs
			.map(t => `${t}-tab`)
			.map(id => document.getElementById(id));
		this.tabContents = tabs
			.map(id => document.getElementById(id));
		this.defaultUrl = this.getUrl();

		this.presetSelect = document.getElementById('preset-select');
		Object.keys(this.presets)
			.sort()
			.forEach(key => {
				const elem = document.createElement('option');
				elem.value = key;
				elem.innerHTML = key;
				this.presetSelect.appendChild(elem);
			});

		this.talkgroupSelect = document.getElementById('talkgroup-select');
		this.talkgroupSelected = document.getElementById('talkgroup-select-active');
		document.getElementById('tg-search').addEventListener('input', (e) => {
			const searchValue = e.target.value;
			let filterFunc = (elem) => elem.innerHTML.toLowerCase().indexOf(searchValue) !== -1;
			if (searchValue === '') {
				filterFunc = () => true;
			}

			[ ...this.talkgroupSelect.querySelectorAll('tr') ]
				.forEach(elem => {
					const show = filterFunc(elem);
					elem.hidden = !show;
				});
		});

		Object.keys(talkgroupMap)
			.forEach(key => {
				const elemParent = document.createElement('tr');
				elemParent.id = `tg-${key}`;
				elemParent.classList.add('tg-row');
				elemParent.setAttribute('data-selected', '0');
				elemParent.addEventListener('click', () => {
					let newHome;
					if (elemParent.getAttribute('data-selected') === '0') {
						newHome = this.talkgroupSelected;
						elemParent.setAttribute('data-selected', '1');
					} else {
						newHome = this.talkgroupSelect;
						elemParent.setAttribute('data-selected', '0');
					}

					newHome.appendChild(elemParent);
				});

				const elem = document.createElement('td');
				elem.innerHTML = talkgroupMap[key];
				elemParent.appendChild(elem);

				this.talkgroupSelect.appendChild(elemParent);
			});

		this.emergOnlyCheckbox = document.getElementById('only-emerg');
	}

	get() {
		this.activeTab = this.tabContents
			.filter(div => div.classList.contains('show'))[0]
			.id;

		if (this.activeTab === 'all') return undefined;

		this.emergOnlyCheckbox.checked = false;

		if (this.activeTab === 'presets'){
			if (this.chosenPreset === null) return undefined;

			this.chosenPreset = this.presetSelect.value;
			return this.presets[this.chosenPreset];
		}
		 
		this.chosenTalkgroups = [ ...this.talkgroupSelected.querySelectorAll('tr') ]
			.map(elem => elem.id.slice(3));

		if (this.chosenTalkgroups.length === 0) return undefined;

		return this.chosenTalkgroups;
	}

	set(urlValue) {
		urlValue = decodeURIComponent(urlValue);

		if (urlValue.indexOf('p') === 0) {
			this.activeTab = 'presets';
			this.chosenPreset = urlValue.slice(1);
			this.presetSelect.value = this.chosenPreset;
		} else if (urlValue.indexOf('tg') === 0) {
			this.activeTab = 'talkgroups';
			this.chosenTalkgroups = urlValue.slice(2).split('|');

			this.chosenTalkgroups.forEach(tg => {
				const elem = document.getElementById(`tg-${tg}`);
				if (elem === null) return;

				this.talkgroupSelected.appendChild(elem);
			});
		}

		this.tabButtons.forEach(div => div.classList.remove('active'));
		this.tabButtons
			.filter(div => div.id === `${this.activeTab}-tab`)
			.forEach(div => div.classList.add('active'));

		this.tabContents.forEach(div => div.classList.remove('active', 'show'));
		this.tabContents
			.filter(div => div.id === this.activeTab)
			.forEach(div => div.classList.add('active', 'show'));
	}

	getUrl(forApi = false) {
		this.get();

		switch (this.activeTab) {
			case 'all':
				return undefined;
			case 'presets':
				if (this.chosenPreset === null) return undefined;
				if (forApi) return this.presets[this.chosenPreset].join('|');
				return encodeURIComponent(`p${this.chosenPreset}`);
			default:
				if (this.chosenTalkgroups.length === 0) return undefined;
				if (forApi) return this.chosenTalkgroups.join('|');
				return encodeURIComponent(`tg${this.chosenTalkgroups.join('|')}`);
		}
	}

	isDefault() {
		return this.getUrl() === this.defaultUrl;
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
