import { ApiUserAuthResponse, ApiUserLoginResult } from "../../common/userApi";
import { showAlert } from "./utils/alerts";
import { useFidoKey, user } from "./utils/auth";
import { getLogger } from "../../common/logger";

const logger = getLogger('login');

const phoneInput = <HTMLInputElement>document.getElementById('phone');
const codeInput = <HTMLInputElement>document.getElementById('code');

const codeContainer = <HTMLDivElement>document.getElementById('code-container');

const getCodeButton = <HTMLButtonElement>document.getElementById('get-code');
const submitCodeButton = <HTMLButtonElement>document.getElementById('submit-code');
const useTokenButton = <HTMLButtonElement>document.getElementById('use-token');

const searchParams: {
	[key: string]: string;
} = location.search
	.slice(1)
	.split('&')
	.filter(v => v !== '')
	.map(v => v.split('=').map(v => decodeURIComponent(v)))
	.reduce((agg, row) => ({ ...agg, [row[0]]: row[1] }), {});
function redirectToPage() {
	logger.trace('redirectToPage', ...arguments);
	let newLocation: string = '/';
	if (typeof searchParams.redirectTo !== 'undefined') {
		newLocation = searchParams.redirectTo;
	}

	window.location.assign(newLocation);
}

if (user.isUser) {
	redirectToPage();
}
function formatPhone() {
	logger.trace('formatPhone', ...arguments);
	const phone = phoneInput.value.replace(/\D/g, '');
	const first = phone.substring(0, 3);
	const middle = phone.substring(3, 6);
	const last = phone.substring(6, 10);

	if (phone.length > 5) phoneInput.value = `${first}-${middle}-${last}`;
	else if (phone.length > 2) phoneInput.value = `${first}-${middle}`;
	else phoneInput.value = `${first}`;

	codeContainer.hidden = true;
	submitCodeButton.hidden = true;
	useTokenButton.hidden = true;
	getCodeButton.hidden = false;
	getCodeButton.disabled = false;
}
phoneInput.addEventListener('keyup', formatPhone);

let fidoKeys: string[] = [];
async function getCode() {
	logger.trace('getCode', ...arguments);
	getCodeButton.classList.remove('btn-primary', 'btn-secondary');
	getCodeButton.classList.add('btn-secondary');
	getCodeButton.disabled = true;

	phoneInput.classList.remove('is-invalid');
	codeInput.classList.remove('is-invalid');

	codeContainer.hidden = true;
	submitCodeButton.hidden = true;
	useTokenButton.hidden = true;

	const apiResult: ApiUserLoginResult = await fetch(`/api/user?action=login`, {
		method: 'POST',
		body: JSON.stringify({ phone: phoneInput.value.replace(/\D/g, '')}),
	}).then(r => r.json());

	if (!apiResult.success) {
		showAlert('danger', apiResult.message || 'Failed to send code');
		apiResult.errors.forEach(key => {
			const elem = document.getElementById(key);
			if (elem !== null) elem.classList.add('is-invalid');
		});
		getCodeButton.classList.remove('btn-secondary', 'btn-primary');
		getCodeButton.classList.add('btn-primary');
		getCodeButton.disabled = false;
		return;
	}

	showAlert('success', 'The authentication code has been sent to your phone. Please enter it below');
	codeContainer.hidden = false;
	submitCodeButton.hidden = false;
	getCodeButton.hidden = true;

	if (
		apiResult.data &&
		apiResult.data.length > 0 &&
		window.PublicKeyCredential
	) {
		fidoKeys = apiResult.data;
		useTokenButton.hidden = false;
	}
}
getCodeButton.addEventListener('click', getCode);
phoneInput.addEventListener('keyup', e => {
	if (e.key === 'Enter') getCode();
});

async function submitCode() {
	logger.trace('submitCode', ...arguments);
	submitCodeButton.classList.remove('btn-primary', 'btn-secondary');
	submitCodeButton.classList.add('btn-secondary');
	submitCodeButton.disabled = true;

	useTokenButton.disabled = true;

	phoneInput.classList.remove('is-invalid');
	codeInput.classList.remove('is-invalid');

	const apiResult: ApiUserAuthResponse = await fetch(`/api/user?action=auth`, {
		method: 'POST',
		body: JSON.stringify({ code: codeInput.value.replace(/\D/g, '') }),
	}).then(r => r.json());

	if (!apiResult.success) {
		showAlert('danger', apiResult.message || 'Failed to authenticate');
		apiResult.errors.forEach(key => {
			const elem = document.getElementById(key);
			if (elem !== null) elem.classList.add('is-invalid');
		});
		submitCodeButton.classList.remove('btn-primary', 'btn-secondary');
		submitCodeButton.classList.add('btn-primary');
		submitCodeButton.disabled = false;
		useTokenButton.disabled = false;
		return;
	}

	showAlert('success', 'You are now logged in');
	redirectToPage();
}
submitCodeButton.addEventListener('click', submitCode);
codeInput.addEventListener('keyup', e => {
	if (e.key === 'Enter') submitCode();
});

async function useToken() {
	logger.trace('useToken', ...arguments);
	if (fidoKeys.length === 0) return;

	useTokenButton.disabled = true;
	submitCodeButton.disabled = true;

	const result = await useFidoKey(fidoKeys, false);

	if (result) {
		redirectToPage();
		return;
	}

	useTokenButton.disabled = false;
	submitCodeButton.disabled = false;
}
useTokenButton.addEventListener('click', useToken);
