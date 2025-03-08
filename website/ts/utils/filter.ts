import { createTableRow } from "./table";
import { getLogger } from "../../../stack/resources/utils/logger";

const logger = getLogger('filter');

export interface AudioFilter {
	update: () => void;
	get: (u: boolean) => string | null;
	set: (val: string) => void;
	isDefault: () => boolean;
	setTalkgroups?: (tg: Talkgroups) => void;
}

export class ToggleFilter implements AudioFilter {
	value: string | null = null;
	element: HTMLInputElement
	defaultUrl: string | null;

	constructor(id: string) {
		logger.trace('ToggleFilter.constructor', ...arguments);
		this.element = <HTMLInputElement>document.getElementById(id);
		this.update();
		this.defaultUrl = this.get();
	}

	update() {
		logger.trace('ToggleFilter.update', ...arguments);
		this.value = this.element.checked ? 'y' : null;
	}

	get() {
		logger.trace('ToggleFilter.get', ...arguments);
		return this.value === null ? null : 'y';
	}

	set(urlValue: string) {
		logger.trace('ToggleFilter.set', ...arguments);
		this.element.checked = urlValue === 'y';
		this.update();
	}

	isDefault() {
		logger.trace('ToggleFilter.isDefault', ...arguments);
		return this.get() === this.defaultUrl;
	}
}

interface Talkgroups {
	[key: string]: {
		name: string;
		selectName: string;
	};
}

const onlyNumbersRegex = /^[0-9]+$/;
export class TalkgroupFilter implements AudioFilter {
	/**
	 * 8090 - ARCC 5
	 * 8181 - ACFE - Alamosa County Fire EMS
	 * 8198 - Ambo
	 * 8330 - Mac
	 * 8331 - BG Tac
	 * 8332 - Fire Dispatch
	 * 8333 - Fire Tac
	 * 8335 - SO Dispatch
	 * 8336 - SO Tac
	 */
	presets: {
		[key: string]: string[];
	} = {
		'NSCAD': [ '8198' ],
		'NSCFPD': [ '8332', '8333', '18332' ],
		'Sag Mac': [ '8330' ],
		'BGFD/BGEMS': [ '8090', '8331', '18331' ],
		'SC Sheriff': [ '8335', '8336' ],
		'NSCAD and NSCFPD': [ '8198', '8330', '8332', '8333', '18332' ],
		'SC All': [ '8090', '8198', '8330', '8331', '8332', '8333', '8335', '8336', '18331', '18332' ],
		'SC All (no ARCC 5)': [ '8198', '8330', '8331', '8332', '8333', '8335', '8336', '18331', '18332' ],
		'ACFE': [ '8181' ],
		'Hospitals': [ '8150', '8151', '124', '8138' ],
	};

	activeTab = 'all';
	chosenPreset: string = 'NSCFPD';
	chosenTalkgroups: string[] = [];

	tabButtons: HTMLDivElement[];
	tabContents: HTMLDivElement[];

	emergOnlyCheckbox: HTMLInputElement;
	presetSelect: HTMLSelectElement;

	talkgroupSelect: HTMLDivElement;
	talkgroupSelected: HTMLDivElement;

	defaultUrl: string | null;

	constructor(talkgroups: Talkgroups | null) {
		logger.trace('TalkgroupFilter.constructor', ...arguments);
		const tabs = [
			'all',
			'presets',
			'talkgroups',
		];

		this.emergOnlyCheckbox = <HTMLInputElement>document.getElementById('only-emerg');

		this.tabButtons = tabs
			.map(t => `${t}-tab`)
			.map(id => <HTMLDivElement>document.getElementById(id));
		this.tabContents = tabs
			.map(id => <HTMLDivElement>document.getElementById(id));

		this.presetSelect = <HTMLSelectElement>document.getElementById('preset-select');
		Object.keys(this.presets)
			.sort()
			.forEach(key => {
				const elem = document.createElement('option');
				this.presetSelect.appendChild(elem);
				elem.value = key;
				elem.innerHTML = key;
				if (key === this.chosenPreset) elem.selected = true;
			});

		this.talkgroupSelect = <HTMLDivElement>document.getElementById('talkgroup-select');
		this.talkgroupSelected = <HTMLDivElement>document.getElementById('talkgroup-select-active');
		const talkgroupSearch = <HTMLInputElement>document.getElementById('tg-search');
		talkgroupSearch.addEventListener('input', () => {
			const searchValue = talkgroupSearch.value.toLowerCase();
			let filterFunc = (elem: HTMLTableCellElement) => elem.id.indexOf(searchValue) !== -1;
			if (searchValue === '')
				filterFunc = () => true;

			Array.from(this.talkgroupSelect.querySelectorAll('td'))
				.forEach(elem => {
					if (elem.parentElement === null) return;
					elem.parentElement.hidden = !filterFunc(elem);
				});
		});

		if (talkgroups !== null)
			this.setTalkgroups(talkgroups);
	
		this.update();
		this.defaultUrl = this.get(false);
	}

	setTalkgroups(talkgroups: Talkgroups) {
		logger.trace('TalkgroupFilter.setTalkgroups', ...arguments);
		Object.keys(talkgroups)
			.sort((a, b) => {
				if (typeof talkgroups[a] === 'undefined') {
					return -1;
				}
				if (typeof talkgroups[b] === 'undefined') {
					return 1;
				}

				const tgAName = talkgroups[a].name;
				const tgBName = talkgroups[b].name;

				if (
					onlyNumbersRegex.test(tgAName) &&
					onlyNumbersRegex.test(tgBName)
				) {
					console.log(tgAName, tgBName);
					return Number(tgAName) > Number(tgBName)
						? 1
						: -1;
				}

				return tgAName.localeCompare(tgBName);
			})
			.forEach(key => {
				const tr = createTableRow(this.talkgroupSelect, {
					id: `tg-${key}`,
					classList: [ 'tg-row' ],
					columns: [
						{
							html: talkgroups[key].selectName,
							id: `${talkgroups[key].name.toLowerCase()}-${key}`,
						},
					],
				});

				tr.setAttribute('data-selected', '0');
				tr.addEventListener('click', () => {
					let newHome;
					if (tr.getAttribute('data-selected') === '0') {
						newHome = this.talkgroupSelected;
						tr.setAttribute('data-selected', '1');
					} else {
						newHome = this.talkgroupSelect;
						tr.setAttribute('data-selected', '0');
					}
					
					newHome.appendChild(tr);
				});

				if (this.chosenTalkgroups.indexOf(key) !== -1) {
					this.talkgroupSelected.appendChild(tr);
					tr.setAttribute('data-selected', '1');
				}
			});

		this.update();
	}

	update() {
		logger.trace('TalkgroupFilter.update', ...arguments);
		this.activeTab = this.tabContents
			.filter(div => div.classList.contains('show'))[0]
			.id;

		if (this.activeTab === 'all') return;

		this.emergOnlyCheckbox.checked = false;

		if (this.activeTab === 'presets') {
			if (this.chosenPreset === null) return;

			this.chosenPreset = this.presetSelect.value;
			return;
		}

		this.chosenTalkgroups = Array.from(this.talkgroupSelected.querySelectorAll('tr'))
			.map(elem => elem.id.slice(3));
	}

	get(forApi: boolean) {
		logger.trace('TalkgroupFilter.get', ...arguments);
		if (this.activeTab === 'all')
			return forApi ? null : 'all';

		if (this.activeTab === 'presets' && this.chosenPreset === null)
			return null;

		if (this.activeTab === 'presets')
			return forApi
				? this.presets[this.chosenPreset].join('|')
				: `p${this.chosenPreset}`;

		if (this.chosenTalkgroups.length === 0) return null;

		return forApi
			? this.chosenTalkgroups.join('|')
			: `tg${this.chosenTalkgroups.join('|')}`;
	}

	set(urlValue: string) {
		logger.trace('TalkgroupFilter.set', ...arguments);
		if (urlValue.indexOf('%') !== -1)
			urlValue = decodeURIComponent(urlValue);
		if (urlValue[0] === 'p') {
			this.activeTab = 'presets';
			this.chosenPreset = urlValue.slice(1);
			this.presetSelect.value = this.chosenPreset;
		} else if (urlValue.slice(0, 2) === 'tg') {
			this.activeTab = 'talkgroups';
			this.chosenTalkgroups = urlValue.slice(2).split('|');

			this.chosenTalkgroups.forEach(tg => {
				let elem = document.getElementById(`tg-${tg}`);
				if (elem === null) return;

				this.talkgroupSelected.appendChild(elem);
				elem.setAttribute('data-selected', '1');
			});
		} else {
			this.activeTab = 'all';
		}

		this.tabButtons.forEach(div => {
			if (div.id === `${this.activeTab}-tab`) {
				div.classList.add('active');
			} else {
				div.classList.remove('active');
			}
		});

		this.tabContents.forEach(div => {
			if (div.id === this.activeTab) {
				div.classList.add('active', 'show');
			} else {
				div.classList.remove('active', 'show');
			}
		});
	}

	isDefault() {
		logger.trace('TalkgroupFilter.isDefault', ...arguments);
		return this.get(false) === this.defaultUrl;
	}
}
