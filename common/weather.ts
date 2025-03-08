export type FireTypes = 'new' | 'ongoing' | 'rx' | 'team';

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