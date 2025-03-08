window.authConfig = window.authConfig || {
	requireAdmin: false,
	requireUser: false
};
window.afterAuth = window.afterAuth || [];

window.user = {
	isUser: false,
	user: null,
	isAdmin: false
};

function redirectToHome() {
	location.href = '/';
}

function redirectToLogin() {
	location.href = `/login.html?redirectTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

fetch(`${baseHost}/api/user?action=getUser`)
	.then(r => r.json())
	.then(data => {
		window.user = data;
	})
	.catch(console.error)
	.finally(() => {
		if (window.authConfig.requireAdmin) {
			window.authConfig.requireUser = true;
		}

		// Redirect to the login page if this page requires login and there isn't a logged in user
		if (
			window.authConfig.requireUser &&
			!window.user.isUser
		) {
			redirectToLogin();
			return;
		}

		// Redirect to the home screen if admin required and not found
		if (
			window.authConfig.requireAdmin &&
			!window.user.isAdmin
		) {
			redirectToHome();
			return;
		}

		// Show the available links
		if (window.user.isUser) {
			[ ...document.getElementsByClassName('requireUser') ]
				.forEach(elem => elem.classList.remove('d-none'));

			document.getElementById('loginLink').classList.add('d-none');
			const username = document.getElementById('username');
			username.innerHTML = window.user.user;
			username.classList.remove('d-none');
			document.getElementById('logoutLink').classList.remove('d-none');
		}
		if (window.user.isAdmin) {
			[ ...document.getElementsByClassName('requireAdmin') ]
				.forEach(elem => elem.classList.remove('d-none'));
		}

		window.afterAuth.forEach(fn => fn());
		window.afterAuth.push = fn => fn();
	});
