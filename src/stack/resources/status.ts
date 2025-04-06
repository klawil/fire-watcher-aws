import * as AWS from 'aws-sdk';
import { sendAlertMessage } from '../utils/general';
import { parseDynamoDbAttributeMap } from '../utils/dynamodb';
import { getLogger } from '../../logic/logger';

const logger = getLogger('status');
const dynamodb = new AWS.DynamoDB();

const metricSource = 'Status';

const statusTable = process.env.TABLE_STATUS;

const maxSpacing = 5 * 60 * 1000; // The amount of time to wait for a heartbeat before failing over (in ms)

interface Heartbeat {
	LastHeartbeat: number;
	Server: string;
	Program: string;
	ServerProgram: string;
	IsActive: boolean;
	IsFailed: boolean;
	IsPrimary: boolean;
	AlertSent?: boolean;
};

type WithRequiredProperty<Type, Key extends keyof Type> = Type & {
  [Property in Key]-?: Type[Property];
};

export async function main() {
	logger.trace('main', ...arguments);

	// Get all of the heartbeats
	const heartbeats: Heartbeat[] = await dynamodb.scan({
		TableName: statusTable
	}).promise()
		.then(results => (results.Items || []).map(parseDynamoDbAttributeMap) as unknown as Heartbeat[]);
	
	const now = Date.now();
	const changedHeartbeats = heartbeats.filter(hb => (hb.IsFailed && now - hb.LastHeartbeat <= maxSpacing) ||
		(!hb.IsFailed && now - hb.LastHeartbeat >= maxSpacing));

	const updateDynamoPromies = Promise.all(changedHeartbeats
		.map(hb => {
			hb.IsFailed = !hb.IsFailed;

			const updateConfig: WithRequiredProperty<AWS.DynamoDB.UpdateItemInput, 'ExpressionAttributeNames' | 'ExpressionAttributeValues' | 'UpdateExpression'> = {
				TableName: statusTable,
				Key: {
					ServerProgram: {
						S: hb.ServerProgram
					},
					Program: {
						S: hb.Program
					}
				},
				ExpressionAttributeNames: {
					'#if': 'IsFailed'
				},
				ExpressionAttributeValues: {
					':if': { BOOL: hb.IsFailed }
				},
				UpdateExpression: 'SET #if = :if'
			};

			if (hb.IsFailed) {
				updateConfig.ExpressionAttributeNames['#ia'] = 'IsActive';
				updateConfig.ExpressionAttributeValues[':ia'] = {
					BOOL: false
				};
				updateConfig.UpdateExpression += ', #ia = :ia';
			}

			return dynamodb.updateItem(updateConfig).promise();
		}));

	const messages = changedHeartbeats
		.filter(hb => hb.Program !== 'dtr')
		.map(hb => {
			const programCaps = hb.Program.toUpperCase();
			const programHeartbeats = heartbeats.filter(hb2 => hb2.Program === hb.Program);
			const primaryHeartbeats = programHeartbeats.filter(hb2 => hb2.IsPrimary);
			const secondaryHeartbeats = programHeartbeats.filter(hb2 => !hb2.IsPrimary);

			const parts = {
				changed: `${hb.IsPrimary ? 'Primary' : 'Secondary'} ${programCaps} server (${hb.Server})`,
				all: `All ${programCaps} servers (${programHeartbeats.map(hb2 => hb2.Server).join(', ')})`,
				primary: `primary ${programCaps} server (${primaryHeartbeats.map(hb2 => hb2.Server).join(', ')})`,
				secondary: `secondary ${programCaps} server (${secondaryHeartbeats.map(hb2 => hb2.Server).join(', ')})`,
			};

			const primaryUp = primaryHeartbeats
				.filter(hb2 => !hb2.IsFailed)
				.length > 0;
			const secondaryUp = secondaryHeartbeats
				.filter(hb2 => !hb2.IsFailed)
				.length > 0;
			const isSecondary = secondaryHeartbeats.length > 0;

			if (primaryUp && secondaryUp) {
				if (hb.IsPrimary) {
					return `${parts.changed} is back online. Switching back to ${hb.Server}.`;
				} else {
					return `${parts.changed} is back online. ${parts.all} are online.`;
				}
			} else if (!primaryUp && secondaryUp) {
				if (hb.IsPrimary) {
					return `${parts.changed} is down. Switching to ${parts.secondary}.`;
				} else {
					return `${parts.changed} is back online. Switching to ${parts.secondary}, ${parts.primary} is still offline.`;
				}
			} else if (primaryUp && !isSecondary) {
				return `${parts.changed} is back online. ${programCaps} recording now occuring.`;
			} else if (primaryUp && !secondaryUp) {
				if (hb.IsPrimary) {
					return `${parts.changed} is back online. Switching to ${parts.primary}, ${parts.secondary} is still offline.`;
				} else {
					return `${parts.changed} is offline. Continuing to record ${programCaps} on ${parts.primary}.`;
				}
			} else if (!primaryUp && (!secondaryUp || !isSecondary)) {
				if (hb.IsPrimary) {
					return `${parts.changed} is offline. ${programCaps} recording is no longer occuring${isSecondary ? ` because ${parts.secondary} is still offline` : ''}.`;
				} else {
					return `${parts.changed} is offline. ${programCaps} recording is no longer occuring because ${parts.primary} is still offline.`;
				}
			} else {
				return `Unkown state. IsPrimary: ${hb.IsPrimary}, primaryUp: ${primaryUp}, secondaryUp: ${secondaryUp}, isSecondary: ${isSecondary}. MEOW.`;
			}
		});

	if (messages.length > 0) {
		logger.debug('main', 'alert messages', messages);
		await sendAlertMessage(metricSource, 'Vhf', messages.join('\n'));
	}

	await updateDynamoPromies;
}
