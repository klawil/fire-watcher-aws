import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';

const s3 = new aws.S3();
const dynamodb = new aws.DynamoDB();

const trafficTable = process.env.TABLE_TRAFFIC as string;
const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const deviceTable = process.env.TABLE_DEVICE as string;

interface SourceListItem {
	pos: number;
	src: number;
}

async function parseRecord(record: lambda.S3EventRecord): Promise<void> {
	try {
		const Bucket = record.s3.bucket.name;
		const Key = record.s3.object.key;

		if (record.eventName.indexOf('ObjectCreated') === 0) {
			console.log(`S3 - CALL - CREATE`);
			const headInfo = await s3.headObject({
				Bucket,
				Key
			}).promise();

			const body: AWS.DynamoDB.PutItemInput = {
				TableName: trafficTable,
				Item: {
					Key: {
						S: Key
					},
					Datetime: {
						N: headInfo.Metadata?.datetime
					},
					Len: {
						N: headInfo.Metadata?.len
					},
					Tone: {
						BOOL: headInfo.Metadata?.tone === 'y'
					},
					ToneIndex: {
						S: headInfo.Metadata?.tone || 'n'
					}
				}
			};

			if (Key.indexOf('/dtr') !== -1) {
				console.log('New DTR');
				const sourceList: string[] = [];
				try {
					if (typeof headInfo.Metadata?.source_list !== 'undefined') {
						JSON.parse(headInfo.Metadata?.source_list)
							.map((v: SourceListItem) => v.src)
							.filter((v: number, i: number, a: number[]) => a.indexOf(v) === i && Number(v) > 0)
							.forEach((source: number) => sourceList.push(`${source}`));
					}
				} catch (e) {}

				body.TableName = dtrTable;
				body.Item = {
					Key: {
						S: Key
					},
					StartTime: {
						N: headInfo.Metadata?.start_time
					},
					EndTime: {
						N: headInfo.Metadata?.stop_time
					},
					Added: {
						N: Date.now().toString()
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
					Sources: {
						NS: sourceList
					},
					Talkgroup: {
						N: headInfo.Metadata?.talkgroup_num
					}
				};

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
							N: headInfo.Metadata?.talkgroup_num
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
							N: headInfo.Metadata?.talkgroup_num
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
							'#tgId': headInfo.Metadata?.talkgroup_num as string
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
							.then(() => doDeviceUpdate ? dynamodb.updateItem(talkgroupDevices).promise() : null)
					];
					if (doDeviceUpdate) {
						promises.push(Promise.all(deviceCreate.map(conf => dynamodb.updateItem(conf).promise()))
							.then(() => Promise.all(deviceUpdate.map(conf => dynamodb.updateItem(conf).promise()))));
					}
					await Promise.all(promises);
				} catch (e) {
					console.log(`ERROR - `, e);
				}
			}

			console.log(`Create: ${JSON.stringify(body)}`)

			await dynamodb.putItem(body).promise();
		} else {
			console.log(`S3 - CALL - DELETE`);
			const dynamoQuery = await dynamodb.query({
				TableName: trafficTable,
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
				TableName: trafficTable
			};
			console.log(`Delete: ${JSON.stringify(body)}`);
			await dynamodb.deleteItem(body).promise();
		}
	} catch (e) {
		console.log(`S3 - ERROR`);
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
