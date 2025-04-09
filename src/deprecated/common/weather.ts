/**
 * @deprecated The method should not be used
 */
export type FireTypes = 'new' | 'ongoing' | 'rx';

/**
 * @deprecated The method should not be used
 */
export interface WeatherResultJson {
	bans: string;
	readiness: {
		[key: string]: number;
	};
	stateFires: {
		[key in FireTypes]: number[];
	};
	updated: string;
	weather: string;
}