window.authConfig = window.authConfig || {
	requireAdmin: false,
	requireUser: false
};
window.afterAuth = window.afterAuth || [];

window.user = {
	loggedIn: false,
	user: null,
	admin: false
};

function redirectToHome() {
	location.href = '/';
}

function redirectToLogin() {
	location.href = `/login.html?redirectTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

fetch('/api?action=getUser')
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

		window.afterAuth.forEach(fn => fn());
		window.afterAuth.push = fn => fn();
	});
