import { ApiUserGetUserResponse } from '../../../common/userApi';

export const afterAuthUpdate: Function[] = [];

const fNameCookie = document.cookie.split('cvfd-user-name=')[1];
export let user: ApiUserGetUserResponse = {
	success: false,
	isActive: document.cookie.indexOf('cvfd-token') !== -1,
	isUser: document.cookie.indexOf('cvfd-token') !== -1,
	isAdmin: document.cookie.indexOf('cvfd-user-admin=1') !== -1,
	isDistrictAdmin: document.cookie.indexOf('cvfd-user-super=1') !== -1,
	fName: typeof fNameCookie !== 'undefined' ? fNameCookie.split(';')[0] : undefined,
}; 

// Show the available links
if (user.isUser) {
	Array.from(document.getElementsByClassName('requireUser'))
		.forEach(elem => elem.classList.remove('d-none'));

	document.getElementById('loginLink').classList.add('d-none');
	const username = document.getElementById('username');
	username.innerHTML = user.fName;
	username.classList.remove('d-none');
	document.getElementById('logoutLink').classList.remove('d-none');
}
if (user.isAdmin) {
	Array.from(document.getElementsByClassName('requireAdmin'))
		.forEach(elem => elem.classList.remove('d-none'));
}

if (document.cookie.indexOf('cvfd-token') !== -1) {
	fetch(`/api/user?action=getUser`)
		.then(r => r.json())
		.then(data => {
			user = data;
		})
		.catch(console.error)
		.finally(() => {
			afterAuthUpdate.forEach(fn => fn());
			afterAuthUpdate.push = fn => fn();
		});
}
