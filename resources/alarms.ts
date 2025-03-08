import * as lambda from 'aws-lambda';
import { sendAlertMessage } from './utils/general';

function parseRecord(event: lambda.SQSRecord): string {
	const body = JSON.parse(JSON.parse(event.body).Message);

	let message = `State change for ${body.AlarmName} - ${body.NewStateValue}`;
	return message;
}

export async function main(event: lambda.SQSEvent): Promise<void> {
	const alarmString = event.Records.map(parseRecord)
		.join('\n');
	await sendAlertMessage(alarmString);
}
