import { changeUrlParams } from "./url";

const player = <HTMLAudioElement>document.getElementById('player');
const playerDuration = document.getElementById('player-duration');
const playerBar = document.getElementById('player-progress');
const playerBarContainer = document.getElementById('player-progress-container');
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

playButtons.forEach(btn => btn.addEventListener('click', () => {
	btn.blur();
	if (playButtonAction === 'play')
		player.play();
	else
		player.pause();
}));

autoPlayButtons.forEach(btn => btn.addEventListener('click', () => {
	autoPlayEnabled = !autoPlayEnabled;
	const method: 'add' | 'remove' = autoPlayEnabled ? 'add' : 'remove';

	autoPlayButtons.forEach(button => {
		if (button.tagName === 'LI')
			button.querySelector('a').classList[method]('active');
		else {
			button.blur();
			button.classList[method]('player-active');
		}
	})
}));

player.addEventListener('durationchange', () => playerDuration.innerHTML = Math.round(player.duration).toString() + ' sec');

player.addEventListener('play', () => {
	playButtonAction = 'pause';
	playButtons.forEach(btn => {
		const bi = btn.querySelector('.bi');
		bi.classList.add('bi-pause-fill');
		bi.classList.remove('bi-play-fill');
	});
});

player.addEventListener('pause', () => {
	playButtonAction = 'play';
	playButtons.forEach(btn => {
		const bi = btn.querySelector('.bi');
		bi.classList.add('bi-play-fill');
		bi.classList.remove('bi-pause-fill');
	});
});

player.addEventListener('timeupdate', () => {
	const newPercent = Math.round(player.currentTime * 100 / player.duration);
	playerBar.style.width = `${newPercent}%`;
});

player.addEventListener('ended', () => {
	if (!autoPlayEnabled) return;

	// Get the next row
	const currentFile = player.getAttribute('data-file');
	if (currentFile === null) return;

	const row = <HTMLTableRowElement>document.getElementById(btoa(currentFile));
	if (row === null) return;

	const nextFile = row.previousElementSibling;
	if (nextFile === null) return;

	setTimeout(playFile, 500, atob(nextFile.id));
});

playerBarContainer.addEventListener('click', e => {
	const container = playerBarContainer.getBoundingClientRect();
	let percent = (e.x - container.x) / container.width;
	if (percent < 0) percent = 0;
	if (percent > 1) percent = 1;

	player.currentTime = player.duration * percent;
});

function markRowAsPlaying(fileName: string) {
	const rowId = btoa(fileName);
	Array.from(document.querySelectorAll('tr'))
		.forEach(row => {
			if (row.id === rowId)
				row.classList.add('table-success');
			else
				row.classList.remove('table-success');
		});
}

export function playFile(fileName: string) {
	try {
		player.src = `https://fire.klawil.net/${fileName}`;
		player.play();
	} catch (e) {
		console.error(e);
	}
	player.setAttribute('data-file', fileName);
	downloadButtons.forEach(btn => {
		btn.setAttribute('href', player.src);
		btn.setAttribute('download', fileName.split('/').pop());
	});

	markRowAsPlaying(fileName);

	changeUrlParams({
		f: fileName.split('/').pop(),
	});
}
