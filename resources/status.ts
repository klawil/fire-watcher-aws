import * as AWS from 'aws-sdk';
import { parseDynamoDbAttributeMap, sendMessage } from './utils';

const dynamodb = new AWS.DynamoDB();

const statusTable = process.env.TABLE_STATUS as string;

const maxSpacing = 60 * 1000;

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

	const messages = changedHeartbeats.map(hb => {
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
		console.log(messages.join('\n'));
		await sendMessage(
			null,
			'***REMOVED***',
			messages.join('\n')
		);
	}

	await updateDynamoPromies;
}
