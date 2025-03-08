export async function main() {
	const accountSid = '***REMOVED***'; // process.env.TWILIO_ACCOUNT_SID;
	const authToken = '***REMOVED***'; // process.env.TWILIO_AUTH_TOKEN;
	const client = require('twilio')(accountSid, authToken);

	await client.incomingPhoneNumbers('PN60e802eaa21b5caf04cf984b198888be')
		.update({accountSid: '***REMOVED***'})
		.then(incoming_phone_number => console.log(incoming_phone_number));
	console.log('Done');
}
