import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';
import { incrementMetric } from './utils/general';

const s3 = new aws.S3();
const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const transcribe = new aws.TranscribeService();
const cloudwatch = new aws.CloudWatch();

const dtrTable = process.env.TABLE_DTR as string;
const dtrTranslationTable = process.env.TABLE_DTR_TRANSLATION as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const sqsQueue = process.env.SQS_QUEUE as string;

const metricSource = 'S3';

const selectDuplicateBuffer = 60; // Select calls 60s each way for analysis for duplicates
const actualDuplicateBuffer = 1; // Check for calls 1s each way for DTR duplicates

const vhfConfig: {
	[key: string]: {
		tg: string;
		freq: string;
	}
} = {
	'BG_FIRE_VHF': {
		tg: '18331',
		freq: '154445000'
	},
	'SAG_FIRE_VHF': {
		tg: '18332',
		freq: '154190000'
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
			let promises: Promise<any>[] = [];

			const metric = incrementMetric('Call', {
				source: metricSource,
				action: `create${Key.indexOf('/dtr') !== -1 ? 'DTR' : 'VHF'}`
			}, false);
			promises.push(metric);
			const headInfo = await s3.headObject({
				Bucket,
				Key
			}).promise();

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
			} = {
				tg: '999999',
				freq: '0',
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
				await cloudwatch.putMetricData({
					Namespace: 'DTR Metrics',
					MetricData: [ {
						MetricName: 'Upload',
						Dimensions: [ {
							Name: 'Tower',
							Value: headInfo.Metadata?.source as string
						} ],
						Unit: 'Count',
						Value: 1
					} ]
				}).promise();
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
						promises.push(metric);
						const transcript: string | null = matchingItems.reduce((transcript: null | string, item) => {
							if (transcript !== null) return transcript;
							return item.Transcript?.S || null;
						}, null);
						const allItems = matchingItems
							.sort((a, b) => {
								const aAdded = Number(a.Added.N);
								const bAdded = Number(b.Added.N);
								const aLen = Number(a.Len.N);
								const bLen = Number(b.Len.N);

								if (aLen === bLen)
									return aAdded > bAdded ? -1 : 1;

								return aLen > bLen ? 1 : -1;
							});
						const itemsToDelete = allItems
							.slice(0, -1);
						const keptItem = allItems.slice(-1)[0];
						promises.push(dynamodb.batchWriteItem({
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
						}).promise());
						promises.push(dynamodb.batchWriteItem({
							RequestItems: {
								[dtrTranslationTable]: itemsToDelete.map(itemToDelete => ({
									PutRequest: {
										Item: {
											Key: { S: itemToDelete.Key.S },
											NewKey: { S: keptItem.Key.S },
											TTL: { N: (Math.round(Date.now() / 1000) + (10 * 60)).toString() },
										}
									}
								}))
							}
						}).promise()
							.catch(e => console.error(e)));
						if (transcript !== null) {
							promises.push(dynamodb.updateItem({
								TableName: dtrTable,
								Key: {
									Talkgroup: { N: keptItem.Talkgroup.N },
									Added: { N: keptItem.Added.N },
								},
								ExpressionAttributeNames: {
									'#t': 'Transcript',
								},
								ExpressionAttributeValues: {
									':t': { S: transcript },
								},
								UpdateExpression: 'SET #t = :t',
							}).promise());
						}
						await Promise.all(promises);
						return;
					}
				}
			}

			if (body.Item.Tone?.BOOL) {
				const transcribeJobName = `${body.Item.Talkgroup.N}-${Date.now()}`;
				const toneFile = Key.split('/')[2] || Key.split('/')[1];
				promises.push(transcribe.startTranscriptionJob({
					TranscriptionJobName: transcribeJobName,
					LanguageCode: 'en-US',
					Media: {
						MediaFileUri: `s3://${Bucket}/${Key}`
					},
					Settings: {
						VocabularyName: 'SagVocab',
						MaxSpeakerLabels: 5,
						ShowSpeakerLabels: true,
					},
					Tags: [
						{ Key: 'Talkgroup', Value: body.Item.Talkgroup?.N as string },
						{ Key: 'File', Value: toneFile },
						{ Key: 'FileKey', Value: Key },
					]
				}).promise());

				promises.push(sqs.sendMessage({
					MessageBody: JSON.stringify({
						action: 'page',
						tg: body.Item.Talkgroup?.N,
						key: toneFile,
						len: Number(body.Item.Len.N)
					}),
					QueueUrl: sqsQueue
				}).promise());
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

			try {
				promises.push(dynamodb.updateItem(talkgroupCreate).promise());
				await Promise.all(promises);
			} catch (e) {
				await incrementMetric('Error', {
					source: metricSource,
					type: 'Talkgroup Update'
				});
				console.error(`ERROR TG AND DEVICES - `, e);
			}
		} else {
			await incrementMetric('Call', {
				source: metricSource,
				action: 'delete'
			}, true, false);
			const dynamoQuery = await dynamodb.query({
				TableName: dtrTable,
				IndexName: 'KeyIndex',
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

			if (dynamoQuery.Items && dynamoQuery.Items.length > 0) {
				const body: AWS.DynamoDB.DeleteItemInput = {
					Key: {
						Talkgroup: dynamoQuery.Items[0].Talkgroup,
						Added: dynamoQuery.Items[0].Added
					},
					TableName: dtrTable
				};
				console.log(`Delete: ${JSON.stringify(body)}`);
				const promises: Promise<any>[] = [];
				promises.push(dynamodb.deleteItem(body).promise());

				promises.push(
					dynamodb.getItem({
						TableName: talkgroupTable,
						Key: {
							ID: dynamoQuery.Items[0].Talkgroup
						}
					}).promise()
						.then(result => {
							if (!result.Item) return;

							const newCount = Number(result.Item.Count.N) - 1;

							return dynamodb.updateItem({
								TableName: talkgroupTable,
								Key: {
									ID: (dynamoQuery.Items as aws.DynamoDB.ItemList)[0].Talkgroup
								},
								ExpressionAttributeNames: {
									'#c': 'Count',
									'#iu': 'InUse'
								},
								ExpressionAttributeValues: {
									':c': {
										N: newCount >= 0 ? newCount.toString() : '0'
									},
									':iu': {
										S: newCount > 0 ? 'Y' : 'N'
									}
								},
								UpdateExpression: 'SET #c = :c, #iu = :iu'
							}).promise();
						})
				);
			
				await Promise.all(promises);
			} else {
				console.log(`Delete Not Found: ${Key}`);
			}
		}
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
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
