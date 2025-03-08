import { ApiAudioListResponse, ApiAudioTalkgroupsResponse, AudioFileObject } from '../../common/audioApi';
import { showAlert } from './utils/alerts';
import { doneLoading } from './utils/loading';
import { playFile, playNewFiles } from './utils/player';
import { ColumnConfig, createTableRow } from './utils/table';
import { changeUrlParams, deleteUrlParams, getUrlParams } from './utils/url';
import { AudioFilter, TalkgroupFilter, ToggleFilter } from './utils/filter';
import { authInit } from './utils/auth';
import { fNameToDate } from '../../common/file';
import { getLogger } from '../../stack/resources/utils/logger';

const logger = getLogger('audio');

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

const dataUpdateFrequency = 5000;

function dateToStr(d: Date) {
	logger.trace('dateToStr', ...arguments);
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
function fileTableColumns(file: AudioFileObject): ColumnConfig[] {
	logger.trace('fileTableColumns', ...arguments);
	const baseClassList = typeof file.Transcript !== 'undefined'
		? [ 'no-bottom-border' ]
		: [];
	return [
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
			html: !file.Tone && file.Emergency !== 1
				? ''
				: typeof file.Transcript === 'undefined'
					? '<i class="bi bi-star"></i>'
					: '<i class="bi bi-star-fill"></i>',
		},
	].map(conf => ({ ...conf, classList: [ ...(conf.classList || []), ...baseClassList ] }));
};
function fileTableTranscriptColumns(file: AudioFileObject): ColumnConfig[] {
	logger.trace('fileTableTranscriptColumns', ...arguments);
	return [
		{ html: '', },
		{
			classList: [ 'text-start' ],
			create: (td: HTMLTableCellElement) => {
				td.setAttribute('colspan', (fileTableColumns(file).length - 2).toString());
				td.innerHTML = `<b>Approximate Transcript:</b> ${file.Transcript || 'N/A'}`;
			},
		},
		{ html: '', },
	];
}

let tgPromise: Promise<void>;
let isAtTopOfPage: boolean = true; // Is the user at the top of the page?
let isUpToLive: boolean = false; // Are there any new files after this file?

function displayRows(newFiles: AudioFileObject[], direction: 'after' | 'before', restart: boolean) {
	logger.trace('displayRows', ...arguments);
	if (restart) fileTable.innerHTML = '';

	// Make the function for actually adding the rows to the table
	let addRowToFiles = (row: HTMLTableRowElement) => fileTable.appendChild(row);
	let reversed = false;
	if (direction === 'after' && fileTable.childElementCount > 0) {
		newFiles.reverse();
		reversed = true;
		addRowToFiles = row => fileTable.insertBefore(row, fileTable.firstChild);
	}

	newFiles.map(file => {
		const row = createTableRow(null, {
			id: btoa(file.Key),
			classList: [ 'tg-row' ],
			columns: fileTableColumns(file),
		});
		let transcriptRow: null | HTMLTableRowElement = null;
		if (typeof file.Transcript !== 'undefined') {
			transcriptRow = createTableRow(null, {
				classList: [ 'tg-row' ],
				columns: fileTableTranscriptColumns(file),
			});
			transcriptRow.setAttribute('data-file-id', btoa(file.Key));
			transcriptRow.addEventListener('click', playFile.bind(null, file.Key))
		}
		row.setAttribute('data-file-id', btoa(file.Key));
		row.addEventListener('click', playFile.bind(null, file.Key))
		if (reversed && transcriptRow !== null) {
			addRowToFiles(transcriptRow);
		}
		addRowToFiles(row);
		if (!reversed && transcriptRow !== null) {
			addRowToFiles(transcriptRow);
		}
	});
}

async function updateData(
	direction: 'after' | 'before' = 'after',
	restart = false,
	date: Date | null = null
) {
	logger.trace('updateData', ...arguments);
	if (date !== null) {
		restart = true;
		isUpToLive = false;
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
		!isUpToLive &&
		typeof nextDataFields.after !== 'undefined'
	) {
		parameters.push(`${direction}=${nextDataFields.after}`);
	} else if (
		direction === 'after' &&
		isUpToLive &&
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

	if (direction === 'after' && apiResults.files.length === 0) {
		isUpToLive = true;
	}

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
		handleLoadNewFiles();
	} else if (direction === 'after' && !isUpToLive) {
		const row = document.getElementById(btoa(apiResults.files[0].Key));
		if (row === null) return;
		setTimeout(() => row.classList.add('tg-row-highlight'), 100);
		setTimeout(() => row.classList.remove('tg-row-highlight'), 800);
	} else if (direction === 'after' && playNewFiles && apiResults.files.length > 0) {
		let rowToPlay = apiResults.files[0];
		playFile(rowToPlay.Key);
		const row = document.getElementById(btoa(rowToPlay.Key));
		if (row === null) return;
		row.scrollIntoView({ block: 'center' });
		handleLoadNewFiles();
	}

	if (
		direction === 'after' &&
		isAtTopOfPage
	) {
		updateTimeouts.forEach(to => clearTimeout(to));
		updateTimeouts = [];
		updateTimeouts.push(window.setTimeout(updateData, dataUpdateFrequency));
	} else if (
		direction === 'after' &&
		date !== null
	) {
		updateData('before');
	}
}

function debounce(fn: Function, minDelay: number): EventListenerOrEventListenerObject {
	logger.trace('debounce', ...arguments);
	let timerId: NodeJS.Timeout | null = null;
	let lastCalledTime: number = 0;

	return function () {
		const nowTime = Date.now();
		if (nowTime - lastCalledTime < minDelay) {
			if (timerId === null) {
				timerId = setTimeout(() => {
					lastCalledTime = Date.now();
					timerId = null;
					fn();
				}, minDelay);
			}
			return;
		}

		lastCalledTime = nowTime;
		fn();
	};
}

// Load new files if within 10% of the screen of the top or bottom of the page
const scrollDebounce: number = 500; // Max 2 events per second
function handleLoadNewFiles() {
	logger.trace('handleLoadNewFiles', ...arguments);
	const scrollY = window.scrollY;
	const winHeight = window.innerHeight;
	const bodyHeight = document.body.getBoundingClientRect().height;

	const offsetHeight = winHeight * 0.1 > 120 ? winHeight * 0.1 : 120;

	isAtTopOfPage = scrollY <= offsetHeight;
	if (scrollY + winHeight >= bodyHeight - offsetHeight) {
		updateData('before');
	} else if (scrollY <= offsetHeight) {
		updateData('after');
	}
}
window.addEventListener('scroll', debounce(handleLoadNewFiles, scrollDebounce));

let talkgroups: {
	[key: string]: {
		name: string;
		selectName: string;
	}
};

async function init() {
	logger.trace('init', ...arguments);
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
		// Subtract a second to make sure the linked file is included
		startDate = new Date(startDate.getTime() - 1000);
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
			const countStr = item.InUse === 'Y'
				? ''
				: ' (No Recordings)';

			agg[item.ID.toString()] = {
				name: item.Name || item.ID.toString(),
				selectName: `${item.Name || item.ID}${countStr}`,
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
	logger.trace('updateUrlFilters', ...arguments);
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
	logger.trace('filterApplyButton.click');
	updateUrlFilters();
	updateData('after', true);
});
filterApplyJumpButton.addEventListener('click', () => {
	logger.trace('filterApplyJumpButton.click');
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
	logger.trace('timeButtons.click', btn);
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
	logger.trace('timeApplyButton.click');
	if (
		startDatePicker === null ||
		typeof startDatePicker.getDate() === 'undefined'
	) return;

	let chosenDate = startDatePicker.getDate().getTime();
	chosenDate += Number(timeSelect.hour.value) * 60 * 60 * 1000;
	chosenDate += Number(timeSelect.minute.value) * 60 * 1000;

	updateData('after', true, new Date(chosenDate));
});
