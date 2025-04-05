export const validPhoneNumberAccounts = [
	'Baca',
	'NSCAD',
	'Crestone',
	'Saguache',
] as const;
export type PhoneNumberAccount = typeof validPhoneNumberAccounts[number];

export type TwilioAccounts = '' | PhoneNumberAccount;
export type TwilioNumberTypes = 'page' | 'alert' | 'chat';

export type PhoneNumberTypes = `${TwilioNumberTypes}${TwilioAccounts}`;
