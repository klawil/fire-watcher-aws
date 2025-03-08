let lastUpdateId = {
	before: null,
	after: null
};
let allowUpdateAfter = true;
let fromDate = false;
const dataUpdateFrequency = 10000;
window.talkgroupMap = window.talkgroupMap || {};
window.talkgroupOptions = window.talkgroupOptions || {};

const nextDataFields = {};
const host = window.location.origin.indexOf('localhost') !== -1
	? 'http://localhost:8001'
	: '';

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

	let apiUrl = `${host}/api?action=dtr`;
	if (typeof nextDataFields.after !== 'undefined') {
		apiUrl += '&'
		if (direction === 'after') {
			apiUrl += `after=${nextDataFields.after}`;
		} else {
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
			display(
				filterData(r.data),
				direction,
				restart
			);
		})
		.catch(console.error);
}
setInterval(() => {
	if (allowUpdateAfter || playNewFiles) updateData('after');
}, dataUpdateFrequency);

function playLive() {
	let fileToPlay = files[0].File;
	if (fromDate) {
		fileToPlay = files[files.length - 1].File;
	}

	play(fileToPlay);
	scrollRowIntoView(fileToPlay);
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

class TalkgroupFilter {
	activeTab = 'all';
	chosenPreset = 'NSCFPD';
	chosenTalkgroups = [];

	presets = {
		'NSCAD': [ '8198' ],
		'NSCFPD': [ '8330', '8332', '8333' ],
		'BGFD/BGEMS': [ '8090', '8331' ],
		'Saguache SO': [ '8335', '8336' ],
		'NSCAD and NSCFPD': [ '8198', '8330', '8332', '8333' ],
		'SC All': [ '8090', '8198', '8330', '8331', '8332', '8333', '8335', '8336' ],
		'SC All (no ARCC 5)': [ '8198', '8330', '8331', '8332', '8333', '8335', '8336' ],
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

		this.emergOnlyCheckbox = document.getElementById('only-emerg');

		this.presetSelect = document.getElementById('preset-select');
		Object.keys(this.presets)
			.sort()
			.forEach(key => {
				const elem = document.createElement('option');
				elem.value = key;
				elem.innerHTML = key;
				if (key === this.chosenPreset) elem.selected = true;
				this.presetSelect.appendChild(elem);
			});

		this.talkgroupSelect = document.getElementById('talkgroup-select');
		this.talkgroupSelected = document.getElementById('talkgroup-select-active');
		document.getElementById('tg-search').addEventListener('input', (e) => {
			const searchValue = e.target.value.toLowerCase();
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
		
		Object.keys(talkgroupOptions)
			.forEach(key => this.createTalkgroupElem(key, talkgroupOptions[key]));

		this.update();
		this.defaultUrl = this.getUrl();
	}

	createTalkgroupElem(id, name) {
		const elemParent = document.createElement('tr');
		elemParent.id = `tg-${id}`;
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
		elem.innerHTML = name;
		elemParent.appendChild(elem);

		this.talkgroupSelect.appendChild(elemParent);

		return elemParent;
	}

	update() {
		this.activeTab = this.tabContents
			.filter(div => div.classList.contains('show'))[0]
			.id;

		if (this.activeTab === 'all') return;

		this.emergOnlyCheckbox.checked = false;

		if (this.activeTab === 'presets'){
			if (this.chosenPreset === null) return;

			this.chosenPreset = this.presetSelect.value;
			return;
		}
		 
		this.chosenTalkgroups = [ ...this.talkgroupSelected.querySelectorAll('tr') ]
			.map(elem => elem.id.slice(3));
	}
	
	get() {
		if (this.activeTab === 'all') return undefined;

		if (this.activeTab === 'presets'){
			if (this.chosenPreset === null) return undefined;

			return this.presets[this.chosenPreset];
		}

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
				let elem = document.getElementById(`tg-${tg}`);
				if (elem === null) {
					elem = this.createTalkgroupElem(tg, tg);
				};

				this.talkgroupSelected.appendChild(elem);
				elem.setAttribute('data-selected', '1');
			});
		} else {
			this.activeTab = 'all';
		}

		this.tabButtons.forEach(div => div.classList.remove('active'));
		this.tabButtons
			.filter(div => div.id === `${this.activeTab}-tab`)
			.forEach(div => div.classList.add('active'));

		this.tabContents.forEach(div => div.classList.remove('active', 'show'));
		this.tabContents
			.filter(div => div.id === this.activeTab)
			.forEach(div => div.classList.add('active', 'show'));

		this.update();
	}

	getUrl(forApi = false) {
		const responseForAll = forApi ? undefined : 'all';

		switch (this.activeTab) {
			case 'all':
				return responseForAll;
			case 'presets':
				if (this.chosenPreset === null) return responseForAll;
				if (forApi) return this.presets[this.chosenPreset].join('|');
				return encodeURIComponent(`p${this.chosenPreset}`);
			default:
				if (this.chosenTalkgroups.length === 0) return responseForAll;
				if (forApi) return this.chosenTalkgroups.join('|');
				return encodeURIComponent(`tg${this.chosenTalkgroups.join('|')}`);
		}
	}

	isDefault() {
		return this.getUrl() === this.defaultUrl;
	}
}

const numberFormatter = new Intl.NumberFormat('en-us', {
	maximumFractionDigits: 0
});
fetch(`${host}/api?action=talkgroups`)
	.then(r => r.json())
	.then(data => {
		if (!data.success) return;

		window.talkgroupMap = data.data
			.reduce((agg, item) => {
				agg[item.ID] = item.Name || item.ID;

				return agg;
			}, {});

		window.talkgroupOptions = data.data
		.reduce((agg, item) => {
			const countStr = item.Count > 100000
				? '>100,000'
				: numberFormatter.format(item.Count);

			agg[item.ID] = `${item.Name || item.ID} (${countStr} recordings)`;

			return agg;
		}, {});

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
	});
