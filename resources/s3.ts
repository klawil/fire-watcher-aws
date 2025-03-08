import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';
import { incrementMetric } from './utils/general';

const s3 = new aws.S3();
const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const deviceTable = process.env.TABLE_DEVICE as string;
const sqsQueue = process.env.SQS_QUEUE as string;

const metricSource = 'S3';

const selectDuplicateBuffer = 60; // Select calls 60s each way for analysis for duplicates
const actualDuplicateBuffer = 1; // Check for calls 1s each way for DTR duplicates

const vhfConfig: {
	[key: string]: {
		tg: string;
		freq: string;
		sendPage: boolean;
	}
} = {
	'BG_FIRE_VHF': {
		tg: '18331',
		freq: '154445000',
		sendPage: true
	},
	'SAG_FIRE_VHF': {
		tg: '18332',
		freq: '154190000',
		sendPage: false
	}
};

interface SourceListItem {
	pos: number;
	src: number;
}

async function parseRecord(record: lambda.S3EventRecord): Promise<void> {
	try {
		const Bucket = record.s3.bucket.name;
		const Key = record.s3.object.key;

		if (record.eventName.indexOf('ObjectCreated') === 0) {
			const metric = incrementMetric('Call', {
				source: metricSource,
				action: `create${Key.indexOf('/dtr') !== -1 ? 'DTR' : 'VHF'}`
			}, false);
			const headInfo = await s3.headObject({
				Bucket,
				Key
			}).promise();
			await metric;

			const body: AWS.DynamoDB.PutItemInput = {
				TableName: dtrTable,
				Item: {
					Key: {
						S: Key
					},
					Added: {
						N: Date.now().toString()
					}
				}
			};

			const sourceList: string[] = [];
			let config: {
				tg: string;
				freq: string;
				sendPage: boolean;
			} = {
				tg: '999999',
				freq: '0',
				sendPage: true
			};
			if (Key.indexOf('/dtr') !== -1) {
				try {
					if (typeof headInfo.Metadata?.source_list !== 'undefined') {
						JSON.parse(headInfo.Metadata?.source_list)
							.map((v: SourceListItem) => v.src)
							.filter((v: number, i: number, a: number[]) => a.indexOf(v) === i && Number(v) > 0)
							.forEach((source: number) => sourceList.push(`${source}`));
					}
				} catch (e) {}

				body.Item = {
					...body.Item,
					StartTime: {
						N: headInfo.Metadata?.start_time
					},
					EndTime: {
						N: headInfo.Metadata?.stop_time
					},
					Len: {
						N: headInfo.Metadata?.call_length
					},
					Freq: {
						N: headInfo.Metadata?.freq
					},
					Emergency: {
						N: headInfo.Metadata?.emergency
					},
					Tone: {
						BOOL: headInfo.Metadata?.tone === 'true'
					},
					ToneIndex: {
						S: headInfo.Metadata?.tone === 'true' ? 'y' : 'n'
					},
					Tower: {
						S: headInfo.Metadata?.source
					},
					Sources: {
						NS: sourceList
					},
					Talkgroup: {
						N: headInfo.Metadata?.talkgroup_num
					}
				};
				if (sourceList.length === 0) {
					delete body.Item.Sources;
				}
			} else {
				for (let vhfKey in vhfConfig) {
					if (Key.indexOf(vhfKey) !== -1) {
						config = vhfConfig[vhfKey];
					}
				}

				body.Item = {
					...body.Item,
					StartTime: {
						N: (Number(headInfo.Metadata?.datetime) / 1000).toString()
					},
					EndTime: {
						N: ((Number(headInfo.Metadata?.datetime) / 1000) + Number(headInfo.Metadata?.len || '0')).toString()
					},
					Len: {
						N: headInfo.Metadata?.len
					},
					Freq: {
						N: config.freq
					},
					Emergency: {
						N: '0'
					},
					Tone: {
						BOOL: headInfo.Metadata?.tone === 'y'
					},
					ToneIndex: {
						S: headInfo.Metadata?.tone || 'n'
					},
					Tower: {
						S: 'vhf'
					},
					Talkgroup: {
						N: config.tg
					}
				};
			}
			await dynamodb.putItem(body).promise();

			if (Key.indexOf('/dtr') !== -1) {
				const startTime: number = Number(body.Item.StartTime?.N);
				const endTime: number = Number(body.Item.EndTime?.N);
				const existingItems: AWS.DynamoDB.QueryOutput = await dynamodb.query({
					TableName: dtrTable,
					IndexName: 'StartTimeTgIndex',
					ExpressionAttributeNames: {
						'#tg': 'Talkgroup',
						'#st': 'StartTime',
						'#e': 'Emergency',
					},
					ExpressionAttributeValues: {
						':tg': {
							N: body.Item?.Talkgroup?.N
						},
						':st1': {
							N: (startTime - selectDuplicateBuffer).toString()
						},
						':st2': {
							N: (endTime + selectDuplicateBuffer).toString()
						},
						':e': {
							N: body.Item?.Emergency?.N
						}
					},
					KeyConditionExpression: '#tg = :tg AND #st BETWEEN :st1 AND :st2',
					FilterExpression: '#e = :e'
				}).promise();
				if (
					!!existingItems.Items &&
					existingItems.Items.length > 1
				) {
					const matchingItems = existingItems.Items.filter(item => {
						const itemStartTime = Number(item.StartTime.N);
						const itemEndTime = Number(item.EndTime.N);

						return (itemStartTime >= startTime - actualDuplicateBuffer && itemStartTime <= endTime + actualDuplicateBuffer) ||
							(itemStartTime - actualDuplicateBuffer <= startTime && itemEndTime + actualDuplicateBuffer >= startTime);
					});

					if (matchingItems.length > 1) {
						const metric = incrementMetric('Event', {
							source: metricSource,
							type: 'dtr',
							event: 'duplicate call'
						}, false);
						const itemsToDelete = matchingItems
							.sort((a, b) => {
								const aAdded = Number(a.Added.N);
								const bAdded = Number(b.Added.N);
								const aLen = Number(a.Len.N);
								const bLen = Number(b.Len.N);

								if (aLen === bLen)
									return aAdded > bAdded ? -1 : 1;

								return aLen > bLen ? 1 : -1;
							})
							.slice(0, -1);
						await dynamodb.batchWriteItem({
							RequestItems: {
								[dtrTable]: itemsToDelete.map(itemToDelete => ({
									DeleteRequest: {
										Key: {
											Talkgroup: {
												N: itemToDelete.Talkgroup.N
											},
											Added: {
												N: itemToDelete.Added.N
											}
										}
									}
								}))
							}
						}).promise();
						await metric;
						return;
					}
				}
			}

			let queuePromise: Promise<null | aws.SQS.SendMessageResult> = new Promise(res => res(null));
			if (body.Item.Tone?.BOOL && config.sendPage) {
				queuePromise = sqs.sendMessage({
					MessageBody: JSON.stringify({
						action: 'page',
						tg: body.Item.Talkgroup?.N,
						key: Key.split('/')[2] || Key.split('/')[1]
					}),
					QueueUrl: sqsQueue
				}).promise();
			}

			const talkgroupCreate: AWS.DynamoDB.UpdateItemInput = {
				TableName: talkgroupTable,
				ExpressionAttributeNames: {
					'#count': 'Count',
					'#dev': 'Devices',
					'#iu': 'InUse'
				},
				ExpressionAttributeValues: {
					':dev': {
						M: {}
					},
					':num': {
						N: '1'
					},
					':iu': {
						S: 'Y'
					}
				},
				Key: {
					'ID': {
						N: body.Item?.Talkgroup?.N
					}
				},
				UpdateExpression: 'SET #iu = :iu, #dev = if_not_exists(#dev, :dev) ADD #count :num'
			};
			let doDeviceUpdate = sourceList.length > 0;
			let updateExpression: string[] = [];
			const talkgroupDevices: AWS.DynamoDB.UpdateItemInput = {
				TableName: talkgroupTable,
				ExpressionAttributeNames: {
					'#dev': 'Devices'
				},
				ExpressionAttributeValues: {
					':num': {
						N: '1'
					}
				},
				Key: {
					'ID': {
						N: body.Item.Talkgroup?.N
					}
				}
			};

			const deviceCreate: AWS.DynamoDB.UpdateItemInput[] = [];
			const deviceUpdate: AWS.DynamoDB.UpdateItemInput[] = [];

			sourceList.forEach((device, index) => {
				if (!talkgroupDevices.ExpressionAttributeNames) talkgroupDevices.ExpressionAttributeNames = {};
				talkgroupDevices.ExpressionAttributeNames[`#dev${index}`] = device;
				updateExpression.push(`#dev.#dev${index} :num`);

				deviceCreate.push({
					TableName: deviceTable,
					ExpressionAttributeNames: {
						'#tg': 'Talkgroups',
						'#count': 'Count'
					},
					ExpressionAttributeValues: {
						':num': {
							N: '1'
						},
						':tg': {
							M: {}
						}
					},
					Key: {
						'ID': {
							N: device
						}
					},
					UpdateExpression: 'SET #tg = if_not_exists(#tg, :tg) ADD #count :num'
				});
				deviceUpdate.push({
					TableName: deviceTable,
					ExpressionAttributeNames: {
						'#tg': 'Talkgroups',
						'#tgId': body.Item?.Talkgroup?.N as string
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
					UpdateExpression: 'ADD #tg.#tgId :num'
				});
			});
			talkgroupDevices.UpdateExpression = `ADD ${updateExpression.join(', ')}`;

			try {
				const promises: Promise<any>[] = [
					dynamodb.updateItem(talkgroupCreate).promise()
						.then(() => doDeviceUpdate ? dynamodb.updateItem(talkgroupDevices).promise() : null),
						queuePromise
				];
				if (doDeviceUpdate) {
					promises.push(Promise.all(deviceCreate.map(conf => dynamodb.updateItem(conf).promise()))
						.then(() => Promise.all(deviceUpdate.map(conf => dynamodb.updateItem(conf).promise()))));
				}
				await Promise.all(promises);
			} catch (e) {
				await incrementMetric('Error', {
					source: metricSource
				});
				console.error(`ERROR TG AND DEVICES - `, e);
			}
		} else {
			await incrementMetric('Event', {
				source: metricSource,
				type: '',
				event: 'delete'
			});
			const dynamoQuery = await dynamodb.query({
				TableName: dtrTable,
				ExpressionAttributeNames: {
					'#key': 'Key'
				},
				ExpressionAttributeValues: {
					':key': {
						S: Key
					}
				},
				KeyConditionExpression: '#key = :key'
			}).promise();

			const body: AWS.DynamoDB.DeleteItemInput = {
				Key: {
					Key: {
						S: Key
					},
					Datetime: {
						N: dynamoQuery.Items && dynamoQuery.Items[0].Datetime.N
					}
				},
				TableName: dtrTable
			};
			console.log(`Delete: ${JSON.stringify(body)}`);
			await dynamodb.deleteItem(body).promise();
		}
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource
		});
		console.error(e);
	}
}

export async function main(event: lambda.S3Event): Promise<void> {
	try {
		await Promise.all(event.Records.map(parseRecord));
	} catch (e) {
		console.error(e);
	}
}
