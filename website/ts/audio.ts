import { ApiAudioListResponse, ApiAudioTalkgroupsResponse, AudioFileObject } from '../../common/audioApi';
import { showAlert } from './utils/alerts';
import { doneLoading } from './utils/loading';
import { playFile } from './utils/player';
import { ColumnConfig, createTableRow } from './utils/table';
import { changeUrlParams, deleteUrlParams, getUrlParams } from './utils/url';
import { AudioFilter, TalkgroupFilter, ToggleFilter } from './utils/filter';
import { authInit } from './utils/auth';
import { fNameToDate } from '../../common/file';

authInit();

interface DatepickerOptions {
	format: string;
	maxDate?: Date | string;
	minDate?: Date | string;
	maxView?: number;
	todayBtn?: boolean;
}

declare class DatepickerClass {
	constructor(a: HTMLDivElement, b: DatepickerOptions);
	getDate(): Date;
	setDate(d: Date): void;
}

type DatepickerConstructor = new(a: HTMLDivElement, b: DatepickerOptions) => DatepickerClass;

declare global {
	interface Window {
		Datepicker: DatepickerConstructor;
	}
}

const dataUpdateFrequency = 10000;

function dateToStr(d: Date) {
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

const lastUpdateId: {
	before: number | null;
	after: number | null;
} = {
	before: null,
	after: null,
};
let updateTimeouts: number[] = [];
const nextDataFields: {
	after?: number;
	before?: number;
	afterAdded?: number;
} = {};
const urlFilters: {
	[key: string]: AudioFilter | TalkgroupFilter
} = {
	tg: new TalkgroupFilter(null),
	emerg: new ToggleFilter('only-emerg'),
};

const fileTable = <HTMLTableElement>document.getElementById('files');
const fileTableColumns = (file: AudioFileObject): ColumnConfig[] => [
	{
		html: file.Len.toString(),
	},
	{
		html: talkgroups[file.Talkgroup]?.name || file.Talkgroup.toString(),
		classList: [ 'text-start' ],
	},
	{
		html: dateToStr(new Date(file.StartTime * 1000)),
	},
	{
		html: file.Tower
			? file.Tower === 'vhf'
				? file.Tower.toUpperCase()
				: file.Tower
			: 'N/A',
	},
	{
		html: file.Emergency === 1 || file.Tone ? '<i class="bi bi-star-fill"></i>' : '',
	},
];

let tgPromise: Promise<void>;
let isLive: boolean = true; // Is the user at the top of the page
let updateLive: boolean = true; // Should we be periodically polling to see if there are new files

function displayRows(newFiles: AudioFileObject[], direction: 'after' | 'before', restart: boolean) {
	if (restart) fileTable.innerHTML = '';

	// Make the function for actually adding the rows to the table
	let addRowToFiles = (row: HTMLTableRowElement) => fileTable.appendChild(row);
	if (direction === 'after' && fileTable.childElementCount > 0) {
		newFiles.reverse();
		addRowToFiles = row => fileTable.insertBefore(row, fileTable.firstChild);
	}

	newFiles.map(file => {
		const row = createTableRow(null, {
			id: btoa(file.Key),
			classList: [ 'tg-row' ],
			columns: fileTableColumns(file),
		});
		row.addEventListener('click', playFile.bind(null, file.Key))
		addRowToFiles(row);
	});
}

async function updateData(
	direction: 'after' | 'before' = 'after',
	restart = false,
	date: Date | null = null
) {
	if (date !== null) {
		restart = true;
		isLive = false;
		updateLive = false;
	}

	if (restart) {
		delete nextDataFields.after;
		delete nextDataFields.before;
		delete nextDataFields.afterAdded;
		lastUpdateId.before = null;
		lastUpdateId.after = null;
	}

	if (lastUpdateId[direction] !== null) return;

	const updateId = Date.now();
	lastUpdateId[direction] = updateId;

	let apiUrl = `/api/audio?`;
	let parameters: string[] = [ 'action=list' ];
	if (date !== null) {
		parameters.push(`${direction}=${Math.round(date.getTime() / 1000)}`);
	} else if (
		direction === 'before' &&
		typeof nextDataFields.before !== 'undefined'
	) {
		parameters.push(`${direction}=${nextDataFields.before}`);
	} else if (
		direction === 'after' &&
		!isLive &&
		typeof nextDataFields.after !== 'undefined'
	) {
		parameters.push(`${direction}=${nextDataFields.after}`);
	} else if (
		direction === 'after' &&
		isLive &&
		typeof nextDataFields.afterAdded !== 'undefined'
	) {
		parameters.push(`afterAdded=${nextDataFields.afterAdded}`);
	}

	Object.keys(urlFilters)
		.filter(key => urlFilters[key].get(true) !== null)
		.forEach(key => parameters.push(`${key}=${encodeURIComponent(urlFilters[key].get(true) as string)}`));

	apiUrl += parameters.join('&');
	
	const apiResults: ApiAudioListResponse = await fetch(apiUrl).then(r => r.json());

	if (lastUpdateId[direction] !== updateId) return;
	lastUpdateId[direction] = null;

	if (!apiResults.success) {
		showAlert('danger', 'Failed to update audio files');
		return;
	}

	if (
		apiResults.before &&
		(
			!nextDataFields.before ||
			nextDataFields.before > apiResults.before
		)
	) {
		nextDataFields.before = apiResults.before;
	}
	if (
		apiResults.after &&
		(
			!nextDataFields.after ||
			nextDataFields.after < apiResults.after
		)
	) {
		nextDataFields.after = apiResults.after;
	}
	if (
		apiResults.afterAdded &&
		(
			!nextDataFields.afterAdded ||
			nextDataFields.afterAdded < apiResults.afterAdded
		)
	) {
		nextDataFields.afterAdded = apiResults.afterAdded;
	}

	if (direction === 'after' && apiResults.files.length === 0)
		isLive = true;

	await tgPromise;

	doneLoading();

	displayRows(apiResults.files, direction, restart);
	if (restart && apiResults.files.length > 0) {
		let rowToPlay = apiResults.files[0];
		if (direction === 'before' || date !== null) {
			rowToPlay = apiResults.files[apiResults.files.length - 1];
		}

		playFile(rowToPlay.Key);
		const row = document.getElementById(btoa(rowToPlay.Key));
		if (row === null) return;
		row.scrollIntoView({ block: 'center' });
		handleLoadNewFiles(null);
	} else if (direction === 'after' && !isLive) {
		const row = document.getElementById(btoa(apiResults.files[0].Key));
		if (row === null) return;
		row.scrollIntoView({ block: 'center' });
		setTimeout(() => row.classList.add('tg-row-highlight'), 100);
		setTimeout(() => row.classList.remove('tg-row-highlight'), 800);
	}

	if (
		direction === 'after' &&
		updateLive &&
		isLive
	) {
		updateTimeouts.forEach(to => clearTimeout(to));
		updateTimeouts = [];
		updateTimeouts.push(window.setTimeout(updateData, dataUpdateFrequency));
	} else if (
		direction === 'after' &&
		date !== null
	) {
		updateData('before');
		lastScrollEventDown = Date.now();
	}
}

// Load new files if within 10% of the screen of the top or bottom of the page
let lastScrollY: number = 0;
let lastScrollEventDown: number = 0;
let lastScrollEventUp: number = 0;
const scrollDebounce = 2000;
function handleLoadNewFiles(e: Event | null) {
	let scrollingDown: boolean | null = null;
	if (e !== null) {
		scrollingDown = window.scrollY > lastScrollY;
		lastScrollY = window.scrollY;
	}

	const scrollY = window.scrollY;
	const winHeight = window.innerHeight;
	const bodyHeight = document.body.getBoundingClientRect().height;

	const offsetHeight = winHeight * 0.1 > 120 ? winHeight * 0.1 : 120;
	
	updateLive = false;
	if (
		scrollY + winHeight >= bodyHeight - offsetHeight &&
		scrollingDown === true
	) {
		if (
			e !== null &&
			lastScrollEventDown - Date.now() >= scrollDebounce
		) return;
		if (e !== null) lastScrollEventDown = Date.now();
		updateData('before')
	} else if (
		scrollY <= offsetHeight &&
		scrollingDown === false
	) {
		updateLive = true;
		if (
			e !== null &&
			lastScrollEventUp - Date.now() >= scrollDebounce
		) return;
		if (e !== null) lastScrollEventUp = Date.now();
		updateData('after');
	}
}
window.addEventListener('scroll', handleLoadNewFiles);

let talkgroups: {
	[key: string]: {
		name: string;
		selectName: string;
	}
};

const numberFormatter = new Intl.NumberFormat('en-us', {
	maximumFractionDigits: 0
});
async function init() {
	if (window.location.href.indexOf('nostart') !== -1) {
		doneLoading();
		deleteUrlParams([ 'nostart', 'cs' ]);
		return;
	}

	let tgPromiseRes: Function = () => {};
	tgPromise = new Promise(res => tgPromiseRes = res);
	
	// Get the starting point
	const urlParams = getUrlParams();
	let startDate: Date | null = null;
	if (
		typeof urlParams.date !== 'undefined' &&
		urlParams.date !== null
	) {
		startDate = new Date(urlParams.date);
		deleteUrlParams([ 'date' ]);
	}	else if (
		typeof urlParams.f !== 'undefined' &&
		urlParams.f !== null
	) {
		startDate = fNameToDate(urlParams.f);
	}

	Object.keys(urlFilters).sort().reverse().forEach(key => {
		if (typeof urlParams[key] !== 'undefined' && urlParams[key] !== null)
			urlFilters[key].set(urlParams[key] as string);
	});

	// Report that the user opened a page
	if (
		typeof urlParams.cs !== 'undefined' &&
		urlParams.cs !== null &&
		typeof urlParams.f !== 'undefined' &&
		urlParams.f !== null
	) {
		fetch(`/api/frontend?action=pageView`, {
			method: 'POST',
			body: JSON.stringify({
				cs: urlParams.cs,
				f: urlParams.f,
			})
		})
			.then(r => r.json());
	}

	if (startDate)
		updateData('after', true, startDate);
	else
		updateData('after', true);

	const tgData: ApiAudioTalkgroupsResponse = await fetch(`/api/audio?action=talkgroups`)
		.then(r => r.json());
	
	if (!tgData.success || typeof tgData.talkgroups === 'undefined') {
		doneLoading();
		showAlert('danger', 'Failed to load talkgroups');
		tgPromiseRes();
		return;
	}
	
	talkgroups = tgData.talkgroups
		.reduce((agg: typeof talkgroups, item) => {
			const countStr = item.Count > 100000
				? '>100,000'
				: numberFormatter.format(item.Count);

			agg[item.ID.toString()] = {
				name: item.Name || item.ID.toString(),
				selectName: `${item.Name || item.ID} (${countStr} recordings)`,
			};

			return agg;
		}, {});
	if (typeof urlFilters.tg.setTalkgroups !== 'undefined')
		urlFilters.tg.setTalkgroups(talkgroups);

	tgPromiseRes();
}
init();

const filterApplyButton = <HTMLButtonElement>document.getElementById('filter-apply');
const filterApplyJumpButton = <HTMLButtonElement>document.getElementById('filter-apply-time');

function updateUrlFilters() {
	const newParams: { [key: string]: string; } = {};
	Object.keys(urlFilters).forEach(key => {
		urlFilters[key].update();
		if (!urlFilters[key].isDefault()) {
			const newValue = urlFilters[key].get(false);
			if (newValue !== null)
				newParams[key] = newValue;
		}
	});

	if (Object.keys(newParams).length > 0)
		changeUrlParams(newParams);
	if (Object.keys(newParams).length < Object.keys(urlFilters).length)
		deleteUrlParams(Object.keys(urlFilters).filter(key => typeof newParams[key] === 'undefined'));
}

filterApplyButton.addEventListener('click', () => {
	updateUrlFilters();
	updateData('after', true);
});
filterApplyJumpButton.addEventListener('click', () => {
	updateUrlFilters();
	const currentFile = getUrlParams().f;
	if (
		typeof currentFile === 'undefined' ||
		currentFile === null ||
		fNameToDate(currentFile).getTime() === 0
	)
		updateData('after', true);
	else
		updateData('after', true, fNameToDate(currentFile));
});

const timeButtons: HTMLButtonElement[] = [
	<HTMLButtonElement>document.getElementById('time-button-d'),
	<HTMLButtonElement>document.getElementById('time-button-m')
];
const timeApplyButton = <HTMLButtonElement>document.getElementById('time-apply');
const timeSelect = {
	hour: <HTMLInputElement>document.getElementById('start-date-hour'),
	minute: <HTMLInputElement>document.getElementById('start-date-minute'),
};

let firstTimeCall = true;
let startDatePicker: DatepickerClass;
timeButtons.forEach(btn => btn.addEventListener('click', () => {
	if (!firstTimeCall) return;
	firstTimeCall = false;

	startDatePicker = new window.Datepicker(
		<HTMLDivElement>document.getElementById('start-date'),
		{
			format: 'yyyy-mm-dd',
			maxDate: new Date(),
			minDate: '2022-07-13',
			maxView: 2,
			todayBtn: true,
		}
	);
	startDatePicker.setDate(new Date());

	let currentTime = new Date();
	timeSelect.hour.value = currentTime.getHours().toString().padStart(2, '0');
	timeSelect.minute.value = (Math.floor(currentTime.getMinutes() / 15) * 15).toString().padStart(2, '0');
}));
timeApplyButton.addEventListener('click', () => {
	if (
		startDatePicker === null ||
		typeof startDatePicker.getDate() === 'undefined'
	) return;

	let chosenDate = startDatePicker.getDate().getTime();
	chosenDate += Number(timeSelect.hour.value) * 60 * 60 * 1000;
	chosenDate += Number(timeSelect.minute.value) * 60 * 1000;

	updateData('after', true, new Date(chosenDate));
});
