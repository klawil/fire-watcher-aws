import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';
import { sendAlertMessage, AlertType } from './utils/general';
import { getLogger } from './utils/logger';

const logger = getLogger('alarms');

const metricSource = 'Alarms';
const cloudWatch = new aws.CloudWatch();

export async function main(event: lambda.CloudWatchAlarmEvent): Promise<void> {
	logger.trace('main', ...arguments);

	const tags: { 'cvfd-alarm-type': AlertType, [key: string]: string } = {
		'cvfd-alarm-type': 'Api',
	};
	try {
		const alarmInfo = await cloudWatch.listTagsForResource({
			ResourceARN: event.alarmArn,
		}).promise();
		alarmInfo.Tags?.forEach(tag => {
			tags[tag.Key] = tag.Value;
		});
	} catch (e) {
		logger.error('main', e);
	}

	const alarmData = event.alarmData;
	let alertMessage = `Alarm for ${alarmData.alarmName} transitioned from ${alarmData.previousState.value} to ${alarmData.state.value}.\n\n`;
	if (alarmData.state.value !== 'OK')
		alertMessage += `Impact: ${alarmData.configuration.description}\n\n`;
	alertMessage += `Reason For Change: ${alarmData.state.reason}`;
	await sendAlertMessage(metricSource, tags['cvfd-alarm-type'], alertMessage);
}
