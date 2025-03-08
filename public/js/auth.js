window.afterAuth = window.afterAuth || [];

fetch('/api?action=getUser')
	.then(r => r.json())
	.then(console.log)
	.then(() => {
		window.afterAuth.forEach(fn => fn());
		window.afterAuth.push = fn => fn();
	})
	.catch(console.error);
