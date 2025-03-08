interface UrlParams {
	[key: string]: string | null;
}

export function getUrlParams(): UrlParams {
	return window.location.search
		.slice(1)
		.split('&')
		.reduce((agg: {
			[key: string]: string;
		}, str: string) => {
			const values = str.split('=')
				.map((v) => decodeURIComponent(v));
			if (values.length === 1)
				agg[values[0]] = null;
			else
				agg[values[0]] = values[1];

			return agg;
		}, {});
}

export function setUrlParams(newUrlParams: UrlParams) {
	const newSearch = Object.keys(newUrlParams)
		.sort()
		.filter(key => key !== '')
		.map(key => {
			if (newUrlParams[key] === null)
				return encodeURIComponent(key);

			return `${encodeURIComponent(key)}=${encodeURIComponent(newUrlParams[key])}`;
		})
		.join('&');

	if (newSearch !== window.location.search.slice(1))
		history.pushState(null, null, `?${newSearch}`);
}

export function changeUrlParams(changeUrlParams: UrlParams) {
	setUrlParams({
		...getUrlParams(),
		...changeUrlParams,
	});
}

export function deleteUrlParams(paramsToDelete: string[]) {
	const newUrlParams = getUrlParams();
	paramsToDelete.forEach(param => delete newUrlParams[param]);
	setUrlParams(newUrlParams);
}
