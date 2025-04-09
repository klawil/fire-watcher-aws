import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';
import { getLogger } from '../../logic/logger';
import { sendAlertMessage } from '../utils/texts';
import { AlertCategory } from '@/types/backend/alerts';
import { dateToTimeString } from '@/logic/strings';

const logger = getLogger('alarms');

const cloudWatch = new aws.CloudWatch();
const s3 = new aws.S3();

const S3_BUCKET = process.env.COSTS_BUCKET;
const S3_KEY = 'alarm-data.json';

interface DataCache {
	[key: string]: {
		type: AlertCategory;
		lastAlarm?: number;
		lastOk?: number;
		lastOkSent?: number;
		lastReason?: string;
	};
}

async function getCachedData(): Promise<DataCache> {
	try {
		const rawData = await s3.getObject({
			Bucket: S3_BUCKET,
			Key: S3_KEY,
		}).promise();

		if (typeof rawData.Body === 'undefined') {
			return {};
		}

		return JSON.parse(rawData?.Body.toString()) as DataCache;
	} catch (e) {
		logger.error(`Failed to get cached alarm data`, e);
		return {};
	}
}

const minOkayTime = 15 * 60 * 1000; // 15 minutes

export async function main(event: lambda.CloudWatchAlarmEvent): Promise<void> {
	logger.trace('main', ...arguments);

	const cachedDataPromise = getCachedData();

	let alarmChange: null | {
		name: string;
		newState: string;
		reason: string;
		type: AlertCategory;
	} = null;
	const nowTime = Date.now();

	if (event.source !== 'aws.events') {
		const tags: { 'cofrn-alarm-type': AlertCategory, [key: string]: string } = {
			'cofrn-alarm-type': 'Api',
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
		const transitionTime = new Date(event.time);
		let alertMessage = `Alarm for ${alarmData.alarmName} transitioned from ${alarmData.previousState.value} to ${alarmData.state.value} at ${dateToTimeString(transitionTime)}.\n\n`;
		if (alarmData.state.value !== 'OK')
			alertMessage += `Impact: ${alarmData.configuration.description}\n\n`;
		alertMessage += `Reason For Change: ${alarmData.state.reason}`;
		alarmChange = {
			name: alarmData.alarmName,
			newState: alarmData.state.value,
			reason: alertMessage,
			type: tags['cofrn-alarm-type'],
		};
	}

	const cachedData = await cachedDataPromise;
	let cacheChanged = false;

	// Send a net new alarm
	if (alarmChange) {
		cachedData[alarmChange.name] = cachedData[alarmChange.name] || {
			type: alarmChange.type,
		};
		const alarmCacheData = cachedData[alarmChange.name];
		alarmCacheData.lastReason = alarmChange.reason;

		switch (alarmChange.newState) {
			case 'OK':
				alarmCacheData.lastOk = nowTime;
				break;
			case 'ALARM':
				alarmCacheData.lastAlarm = nowTime;
				if (
					!alarmCacheData.lastOk ||
					!alarmCacheData.lastOkSent ||
					alarmCacheData.lastOkSent > alarmCacheData.lastOk
				) {
					await sendAlertMessage(alarmChange.type, alarmChange.reason);
				}
				break;
		}
		cacheChanged = true;
	}

	// Send the okay messages if enough time has elapsed
	await Promise.all(Object.keys(cachedData)
		.map(alarmName => {
			const alarmData = cachedData[alarmName];
			if (
				!alarmData.lastOk ||
				(
					alarmData.lastAlarm &&
					alarmData.lastOk < alarmData.lastAlarm
				) ||
				alarmData.lastOk > nowTime - minOkayTime ||
				!alarmData.lastReason ||
				(
					alarmData.lastOkSent &&
					alarmData.lastOkSent > alarmData.lastOk
				)
			) return;

			alarmData.lastOkSent = nowTime;
			cacheChanged = true;
			return sendAlertMessage(alarmData.type, alarmData.lastReason);
		}));

	if (cacheChanged) {
		await s3.putObject({
			Bucket: S3_BUCKET,
			Key: S3_KEY,
			Body: JSON.stringify(cachedData),
		}).promise();
	}
}
