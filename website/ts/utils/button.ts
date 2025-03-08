export type ButtonColors = 'primary' | 'secondary' | 'success'
| 'danger' | 'warning' | 'info' | 'light' | 'dark' | 'link';

const buttonColorClasses: string[] = [
	'btn-primary',
	'btn-secondary',
	'btn-success',
	'btn-danger',
	'btn-warning',
	'btn-info',
	'btn-light',
	'btn-dark',
	'btn-link',
];

export function changeButtonColor(btn: HTMLButtonElement, color: ButtonColors) {
	btn.classList.remove.apply(btn.classList, buttonColorClasses);
	btn.classList.add(`btn-${color}`);
}

export function changeButtonText(btn: HTMLButtonElement, text: string, spinner?: boolean) {
	btn.innerHTML = '';

	if (spinner) {
		const spinDiv = document.createElement('div');
		btn.appendChild(spinDiv);
		spinDiv.classList.add('spinner-border', 'spinner-border-sm');
		text = ` ${text}`;
	}

	btn.innerHTML += text;
}

export function modifyButton(
	btn: HTMLButtonElement,
	color?: ButtonColors,
	text?: string,
	spinner?: boolean,
	enabled?: boolean
) {
	if (color)
		changeButtonColor(btn, color);

	if (text)
		changeButtonText(btn, text, spinner);

	if (enabled !== null)
		btn.disabled = !enabled;
}
