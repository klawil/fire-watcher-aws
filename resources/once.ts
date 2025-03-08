import * as aws from 'aws-sdk';

const dynamodb = new aws.DynamoDB();

const dtrTable = process.env.TABLE_DTR as string;
const deviceTable = process.env.TABLE_DEVICE as string;

interface DeviceData {
	[key: string]: {
		total: number;
		talkgroups: {
			[key: string]: number;
		};
	};
};

interface TalkgroupData {
	[key: string]: {
		[key: string]: number;
	}
}

export async function main() {
	const data = await dynamodb.query({
		TableName: dtrTable,
		IndexName: 'StartTimeEmergIndex',
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#emerg': 'Emergency'
		},
		ExpressionAttributeValues: {
			':emerg': {
				N: '0'
			}
		},
		KeyConditionExpression: '#emerg = :emerg',
		Limit: 50
	}).promise();

	if (typeof data.Items === 'undefined') return;

	for (let i = 0; i < data.Items.length; i++) {
		const item = data.Items[i];

		if (
			typeof item.Sources === 'undefined' ||
			typeof item.Sources.NS === 'undefined' ||
			typeof item.Talkgroup.N === 'undefined'
		) continue;

		const talkgroup = item.Talkgroup.N;

		for (let j = 0; j < item.Sources.NS.length; j++) {
			const device = item.Sources.NS[j];
			if (Number(device) <= 0) continue;

			await dynamodb.updateItem({
				TableName: deviceTable,
				ExpressionAttributeNames: {
					'#count': 'Count',
					'#tg': 'Talkgroups'
				},
				ExpressionAttributeValues: {
					':initialtg': {
						M: {}
					},
					':initial': {
						N: '0'
					},
					':num': {
						N: '1'
					}
				},
				Key: {
					'ID': {
						N: device
					}
				},
				UpdateExpression: 'SET #count = if_not_exists(#count, :initial) + :num, #tg = if_not_exists(#tg, :initialtg)'
			}).promise();

			await dynamodb.updateItem({
				TableName: deviceTable,
				ExpressionAttributeNames: {
					'#tg': 'Talkgroups',
					'#tgid': talkgroup
				},
				ExpressionAttributeValues: {
					':num': {
						N: '1'
					}
				},
				Key: {
					'ID': {
						N: device
					}
				},
				UpdateExpression: 'ADD #tg.#tgid :num'
			}).promise();
		}
	}

	const devices: DeviceData = {};
	const talkgroups: TalkgroupData = {};

	data.Items.forEach(item => {
		if (
			typeof item.Sources === 'undefined' ||
			typeof item.Sources.NS === 'undefined' ||
			typeof item.Talkgroup.N === 'undefined'
		) return;
		const talkgroup = item.Talkgroup.N;

		if (typeof talkgroups[talkgroup] === 'undefined') {
			talkgroups[talkgroup] = {};
		}

		item.Sources.NS
			.filter(device => Number(device) > 0)
			.forEach(device => {
				if (typeof devices[device] === 'undefined') {
					devices[device] = {
						total: 0,
						talkgroups: {}
					};
				}

				if (typeof devices[device].talkgroups[talkgroup] === 'undefined') {
					devices[device].talkgroups[talkgroup] = 0;
				}

				devices[device].total++;
				devices[device].talkgroups[talkgroup]++;

				if (typeof talkgroups[talkgroup][device] === 'undefined') {
					talkgroups[talkgroup][device] = 0;
				}
				talkgroups[talkgroup][device]++;
			});
	});

	console.log(devices);
	console.log(talkgroups);
	console.log(`Items - ${data.Items.length}`);
	console.log(`Devices - ${Object.keys(devices).length}`);
	console.log(`Talkgroups - ${Object.keys(talkgroups).length}`);
	console.log(`Last - `, data.LastEvaluatedKey);
}
