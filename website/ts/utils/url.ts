import { getLogger } from '../../../common/logger';

interface UrlParams {
	[key: string]: string | null;
}

const logger = getLogger('url');

export function getUrlParams(): UrlParams {
	logger.trace('getUrlParams');
	return window.location.search
		.slice(1)
		.split('&')
		.reduce((agg: UrlParams, str: string) => {
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
	logger.trace('setUrlParams', newUrlParams);
	const newSearch = Object.keys(newUrlParams)
		.sort()
		.filter(key => key !== '')
		.map(key => {
			const newParamValue = newUrlParams[key];
			if (newParamValue === null || typeof newParamValue === 'undefined')
				return encodeURIComponent(key);

			return `${encodeURIComponent(key)}=${encodeURIComponent(newParamValue)}`;
		})
		.join('&');

	if (newSearch !== window.location.search.slice(1))
		history.pushState(null, '', `?${newSearch}`);
}

export function changeUrlParams(changeUrlParams: UrlParams) {
	logger.trace('changeUrlParams', changeUrlParams);
	setUrlParams({
		...getUrlParams(),
		...changeUrlParams,
	});
}

export function deleteUrlParams(paramsToDelete: string[]) {
	logger.trace('deleteUrlParams', paramsToDelete);
	const newUrlParams = getUrlParams();
	paramsToDelete.forEach(param => delete newUrlParams[param]);
	setUrlParams(newUrlParams);
}
