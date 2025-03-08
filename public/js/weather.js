fetch('/weather.json')
	.then(r => r.json())
	.then(data => {
		document.body.innerHTML += data.weather;
		document.body.innerHTML += `<br><br><b>Fire Restrictions</b><br>`;
		document.body.innerHTML += data.bans;

		console.log(data);
	});
