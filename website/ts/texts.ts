import { ApiFrontendListTextsResponse, AnnouncementApiBody } from '../../common/frontendApi';
import { doneLoading } from './utils/loading';
import { createTableRow } from './utils/table';
import { authInit, user } from './utils/auth';
import { getLogger } from '../../stack/resources/utils/logger';
import { pagingConfig, PagingTalkgroup, pagingTalkgroupOrder, UserDepartment, validDepartments } from '../../common/userConstants';
import { showAlert } from './utils/alerts';
import { changeButtonColor, modifyButton } from './utils/button';
import { ApiUserLoginResult } from '../../common/userApi';

const logger = getLogger('texts');

authInit();

const vhfPageRegex = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;
const dtrPageRegex = /\d{4}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
function parseForPageTime(pageId: string): number {
	logger.trace('parseForPageTime', ...arguments);
	let d = new Date();
	if (dtrPageRegex.test(pageId)) {
		const match = pageId.match(dtrPageRegex) as string[];
		d = new Date(parseInt(match[1], 10) * 1000);
	} else {
		const match = pageId.match(vhfPageRegex) as string[];
		d.setUTCFullYear(parseInt(match[1], 10));
		d.setUTCMonth(parseInt(match[2], 10) - 1);
		d.setUTCDate(parseInt(match[3], 10));
		d.setUTCHours(parseInt(match[4], 10));
		d.setUTCMinutes(parseInt(match[5], 10));
		d.setUTCSeconds(parseInt(match[6], 10));
	}

	return d.getTime();
}

function padLeft(num: number, len = 2): string {
	logger.trace('padLeft', ...arguments);
	return `${num}`.padStart(len, '0');
}

function dateTimeToTimeStr(datetime: number): string {
	logger.trace('dateTimeToTimeStr', ...arguments);
	let d = new Date(datetime);
	return [
		[
			padLeft(d.getFullYear(), 4),
			padLeft(d.getMonth() + 1),
			padLeft(d.getDate())
		].join('-'),
		' ',
		[
			padLeft(d.getHours()),
			padLeft(d.getMinutes()),
			padLeft(d.getSeconds())
		].join(':')
	].join('');
}

function makePercentString(numerator: number, denominator: number) {
	logger.trace('makePercentString', ...arguments);
	if (denominator === 0) return '';
	const percentStr = `${Math.round(numerator * 100 / denominator)}%`;

	if (numerator !== denominator) {
		return `${percentStr}<br>(${numerator})`;
	}

	return percentStr;
}

function parseMediaUrls(mediaUrls: string) {
	logger.trace('parseMediaUrls', ...arguments);
	return mediaUrls
		.split(',')
		.filter(s => s !== '')
		.map((v, i) => `<a href="${v}">${i + 1}</a>`)
		.join(',');
}

function getPercentile(values: number[], percentile: number) {
	logger.trace('getPercentile', ...arguments);
	if (values.length === 0) return '';

	values = values.sort((a, b) => a > b ? 1 : -1);
	const index = Math.ceil(values.length * percentile / 100) - 1;

	let valueSeconds = Math.round(values[index] / 1000);
	const maxValue = valueSeconds;
	let timeStr = '';
	if (maxValue >= 60 * 60) {
		const hours = Math.floor(valueSeconds / (60 * 60));
		timeStr += `${hours}:`;
		valueSeconds -= (hours * 60 * 60);
	}
	const minutes = Math.floor(valueSeconds / 60);
	timeStr += `${minutes.toString().padStart(2, '0')}:`;
	valueSeconds -= (minutes * 60);
	timeStr += `${valueSeconds.toString().padStart(2, '0')}`;

	return timeStr;
}

async function loadAndDisplayTexts(isPage: boolean, before: number | null = null) {
	const apiResults: ApiFrontendListTextsResponse = await fetch(`/api/frontend?action=listTexts${isPage ? '&page=y' : ''}${before !== null ? `&before=${before}` : ''}`)
		.then(r => r.json());

	const tbody = document.getElementById(isPage ? 'pages' : 'texts') as HTMLTableSectionElement;
	(apiResults.data || [])
		.sort((a, b) => a.datetime > b.datetime ? -1 : 1)
		.map(text => {
			if (text.isPage)
				text.pageTime = parseForPageTime(text.body);
		
			const baselineTime = text.isPage ? text.pageTime || text.datetime : text.datetime;

			text.delivered = text.delivered || [];
			text.delivered = text.delivered.map(t => t - baselineTime);

			return text;
		})
		.forEach((text, idx, arr) => {
			text.delivered = text.delivered || [];
			text.sent = text.sent || [];
			text.undelivered = text.undelivered || [];
			text.delivered = text.delivered || [];
			text.csLooked = text.csLooked || [];

			const row = createTableRow(tbody, {
				columns: [
					{
						html: dateTimeToTimeStr(text.datetime),
					},
					{
						html: text.body.replace(/\n/g, '<br>'),
					},
					{
						filter: !isPage,
						html: parseMediaUrls(text.mediaUrls || ''),
					},
					{
						classList: [ 'text-center' ],
						html: text.recipients.toString(),
					},
					{
						classList: [ 'text-center' ],
						html: makePercentString(text.sent.length, text.recipients),
					},
					{
						classList: [ 'text-center' ],
						html: makePercentString(text.delivered.length, text.recipients),
					},
					{
						classList: [ 'text-center' ],
						html: makePercentString(text.undelivered.length, text.recipients),
					},
					{
						filter: isPage,
						classList: [ 'text-center' ],
						html: text.isPage ? makePercentString(text.csLooked.length, text.recipients) : '',
					},
					{
						filter: isPage,
						classList: [ 'text-center' ],
						html: `${Math.round((text.datetime - (text.pageTime || text.datetime)) / 1000)}s`,
					},
					{
						classList: [ 'text-center' ],
						html: getPercentile(text.delivered, 50),
					},
					{
						classList: [ 'text-center' ],
						html: getPercentile(text.delivered, 75),
					},
					{
						classList: [ 'text-center' ],
						html: getPercentile(text.delivered, 100),
					},
				]
			});
			
			// Add a listener for the last row to load the next row(s)
			if (idx === arr.length - 1) {
				const observer = new IntersectionObserver(entries => {
					let wasSeen = entries.reduce((agg, entry) => {
						if (agg) return agg;

						return entry.isIntersecting;
					}, false);
					
					if (wasSeen) {
						observer.disconnect();
						loadAndDisplayTexts(isPage, text.datetime);
					}
				}, {
					threshold: 0.1,
				});
				observer.observe(row);
			}
		});
}

async function init() {
	logger.trace('init', ...arguments);

	await Promise.all([
		true,
		false,
	].map(v => loadAndDisplayTexts(v)));

	const departmentSelect = document.getElementById('department') as HTMLSelectElement;
	const talkgroupSelect = document.getElementById('talkgroup') as HTMLSelectElement;
	const sendButton = document.getElementById('text-send') as HTMLButtonElement;
	const textBodyInput = document.getElementById('text-body') as HTMLTextAreaElement;
	const testModeSwitch = document.getElementById('text-test') as HTMLInputElement;
	const inputs: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] = [
		departmentSelect,
		talkgroupSelect,
		textBodyInput,
		testModeSwitch,
	];
	const textBody: AnnouncementApiBody = {
		body: '',
	};
	if (!user.isDistrictAdmin) {
		talkgroupSelect.hidden = true;
		(document.getElementById('text-test-container') as HTMLDivElement).hidden = true;
	} else {
		pagingTalkgroupOrder
			.forEach(tg => {
				const option = document.createElement('option');
				talkgroupSelect.appendChild(option);
				option.value = tg.toString();
				option.innerHTML = pagingConfig[tg].partyBeingPaged;
			});
		talkgroupSelect.addEventListener('change', () => {
			if (talkgroupSelect.value === 'none') {
				delete textBody.talkgroup;
			} else {
				textBody.talkgroup = Number(talkgroupSelect.value) as PagingTalkgroup;
				delete textBody.department;
				departmentSelect.value = 'none';
			}
		});
	}
	validDepartments
		.filter(dep => user.isDistrictAdmin || (user[dep]?.active && user[dep]?.admin))
		.forEach((dep, i, a) => {
			const option = document.createElement('option');
			departmentSelect.appendChild(option);
			option.value = dep;
			option.innerHTML = dep;

			if (a.length === 1) {
				option.selected = true;
				departmentSelect.disabled = true;
				textBody.department = dep;
			}
		});
	departmentSelect.addEventListener('change', () => {
		if (departmentSelect.value === 'none') {
			delete textBody.department;
		} else {
			textBody.department = departmentSelect.value as UserDepartment;
			delete textBody.talkgroup;
			talkgroupSelect.value = 'none';
		}
	});
	sendButton.addEventListener('click', async () => {
		inputs.forEach(input => input.classList.remove('is-invalid'));
		textBody.body = textBodyInput.value;
		textBody.test = testModeSwitch.checked && user.isDistrictAdmin;
		if (textBody.body === '') {
			showAlert('danger', 'You must have something in the body to send a text');
			return;
		}
		if (
			typeof textBody.department === 'undefined' &&
			typeof textBody.talkgroup === 'undefined'
		) {
			departmentSelect.classList.add('is-invalid');
			talkgroupSelect.classList.add('is-invalid');
			showAlert('danger', 'You must select a department to send a message to');
			return;
		}

		modifyButton(sendButton, 'secondary', 'Sending', true, false);
		const result = await fetch(`/api/frontend?action=announce`, {
			method: 'POST',
			body: JSON.stringify(textBody),
		}).then(r => r.json()) as ApiUserLoginResult;
		modifyButton(sendButton, 'primary', 'Send Message', false, true);
		if (!result.success) {
			changeButtonColor(sendButton, 'danger');
			inputs
				.filter(input => result.errors.includes(input.name))
				.forEach(input => input.classList.add('is-invalid'));
		} else {
			if (!departmentSelect.disabled) {
				departmentSelect.value = 'none';
			}
			talkgroupSelect.value = 'none';
			textBodyInput.value = '';
		}
	});

	doneLoading();
}
init();
