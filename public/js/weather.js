fetch('/weather.json')
	.then(r => r.json())
	.then(console.log);
