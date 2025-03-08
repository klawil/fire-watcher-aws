import { changeUrlParams } from "./url";
import { getLogger } from "../../../stack/resources/utils/logger";

const logger = getLogger('player');

const player = <HTMLAudioElement>document.getElementById('player');
const playerDuration = <HTMLDivElement>document.getElementById('player-duration');
const playerBar = <HTMLDivElement>document.getElementById('player-progress');
const playerBarContainer = <HTMLDivElement>document.getElementById('player-progress-container');
const playButtons: HTMLButtonElement[] = [
	<HTMLButtonElement>document.getElementById('play-button-m'),
	<HTMLButtonElement>document.getElementById('play-button-d'),
];
const autoPlayButtons: HTMLButtonElement[] = [
	<HTMLButtonElement>document.getElementById('autoplay-button-m'),
	<HTMLButtonElement>document.getElementById('autoplay-button-d'),
];
const downloadButtons: HTMLButtonElement[] = [
	<HTMLButtonElement>document.getElementById('download-button-m'),
	<HTMLButtonElement>document.getElementById('download-button-d'),
];

let playButtonAction: 'play' | 'pause' = 'play';
export let autoPlayEnabled: boolean = true;
export let playNewFiles: boolean = false;

playButtons.forEach(btn => btn.addEventListener('click', () => {
	logger.trace('Play button click', btn);
	btn.blur();
	if (playButtonAction === 'play')
		player.play();
	else
		player.pause();
}));

autoPlayButtons.forEach(btn => btn.addEventListener('click', () => {
	logger.trace('Auto play button click', btn);
	autoPlayEnabled = !autoPlayEnabled;
	const method: 'add' | 'remove' = autoPlayEnabled ? 'add' : 'remove';

	autoPlayButtons.forEach(button => {
		if (button.tagName === 'LI') {
			const a = button.querySelector('a');
			if (a !== null)
				a.classList[method]('active');
		} else {
			button.blur();
			button.classList[method]('player-active');
		}
	})
}));

let currentPlayerShowMinutes: boolean = false;
function timestampToString(ts: number): string {
	logger.trace('timestampToString', ...arguments);
	let durationString: string = '';
	ts = Math.floor(ts / 0.1) * 0.1;
	
	// Add the minutes (if needed)
	if (currentPlayerShowMinutes) {
		let minutes = Math.floor(ts / 60);
		ts = ts % 60;
		durationString += `${minutes.toString().padStart(2, '0')}:`;
	}

	// Add the seconds
	durationString += ts.toFixed(1).toString().padStart(4, '0');

	return durationString;
}

player.addEventListener('durationchange', () => {
	logger.trace('player.durationchange');
	playerDuration.innerHTML = `${timestampToString(player.currentTime)} / ${timestampToString(player.duration)}`;
});

player.addEventListener('play', () => {
	logger.trace('player.play');
	playButtonAction = 'pause';
	playButtons.forEach(btn => {
		const bi = btn.querySelector('.bi');
		if (bi === null) return;
		bi.classList.add('bi-pause-fill');
		bi.classList.remove('bi-play-fill');
	});
});

player.addEventListener('pause', () => {
	logger.trace('player.pause');
	playButtonAction = 'play';
	playButtons.forEach(btn => {
		const bi = btn.querySelector('.bi');
		if (bi === null) return;
		bi.classList.add('bi-play-fill');
		bi.classList.remove('bi-pause-fill');
	});
});

player.addEventListener('timeupdate', () => {
	logger.trace('player.timeupdate');
	const newPercent = Math.round(player.currentTime * 100 / player.duration);
	playerBar.style.width = `${newPercent}%`;
	playerDuration.innerHTML = `${timestampToString(player.currentTime)} / ${timestampToString(player.duration)}`;
});

player.addEventListener('ended', () => {
	logger.trace('player.ended');
	if (!autoPlayEnabled) return;

	// Get the next row
	const currentFile = player.getAttribute('data-file');
	if (currentFile === null) {
		playNewFiles = true;
		logger.error('Unable to find current file information');
		return;
	}

	const row = <HTMLTableRowElement>document.getElementById(btoa(currentFile));
	if (row === null) {
		playNewFiles = true;
		logger.error('Unable to find current file row', currentFile);
		return;
	}

	const nextFile = row.previousElementSibling;
	if (nextFile === null) {
		playNewFiles = true;
		logger.debug('No next file to play, holding');
		return;
	}

	logger.debug('Playing next file:', atob(nextFile.id));
	playNewFiles = false;
	setTimeout(playFile, 100, atob(nextFile.id));
});

playerBarContainer.addEventListener('click', e => {
	logger.trace('playerBarContainer.click');
	const container = playerBarContainer.getBoundingClientRect();
	let percent = (e.x - container.x) / container.width;
	if (percent < 0) percent = 0;
	if (percent > 1) percent = 1;

	player.currentTime = player.duration * percent;
});

function markRowAsPlaying(fileName: string) {
	logger.trace('markRowAsPlaying', ...arguments);
	const rowId = btoa(fileName);
	Array.from(document.querySelectorAll('tr'))
		.forEach(row => {
			const rowFileId = row.getAttribute('data-file-id');
			if (rowFileId === rowId)
				row.classList.add('table-success');
			else
				row.classList.remove('table-success');
		});
}

export function playFile(fileName: string) {
	logger.trace('playFile', ...arguments);
	playNewFiles = false;
	try {
		player.src = `https://cofrn.org/${fileName}`;
		player.play();
	} catch (e) {
		logger.error('playFile', e);
	}
	player.setAttribute('data-file', fileName);
	const fileNameShort = fileName.split('/').pop() || fileName;
	downloadButtons.forEach(btn => {
		btn.setAttribute('href', player.src);
		btn.setAttribute('download', fileNameShort);
	});

	markRowAsPlaying(fileName);

	changeUrlParams({
		f: fileNameShort,
	});
}
