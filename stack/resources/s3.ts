import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';
import { incrementMetric } from './utils/general';
import { PageBody } from './types/queue';
import { PagingTalkgroup, PhoneNumberAccount } from '../../common/userConstants';
import { getLogger } from './utils/logger';

const logger = getLogger('s3');
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

const talkgroupsToTag: {
	[key: string]: PhoneNumberAccount;
} = {
	'8198': 'NSCAD',
	'8332': 'Crestone',
	'18332': 'Crestone',
	'18331': 'Baca',
	'8331': 'Baca',
};

const towerToStation: {
	[key: string]: 'NSCAD' | 'CVFD';
} = {
	Alamosa: 'CVFD',
	Saguache: 'NSCAD',
	SanAntonio: 'CVFD',
	PoolTable: 'CVFD',
};

async function parseRecord(record: lambda.S3EventRecord): Promise<void> {
	logger.trace('parseRecord', ...arguments);
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

			const addedTime = Date.now();
			const body: AWS.DynamoDB.PutItemInput = {
				TableName: dtrTable,
				Item: {
					Key: {
						S: Key
					},
					Added: {
						N: addedTime.toString()
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
			let fileTag: PhoneNumberAccount | null = null;
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
				if (
					headInfo.Metadata?.talkgroup_num &&
					typeof talkgroupsToTag[headInfo.Metadata?.talkgroup_num] !== 'undefined'
				) {
					fileTag = talkgroupsToTag[headInfo.Metadata?.talkgroup_num];
				}
				if (sourceList.length === 0) {
					delete body.Item.Sources;
				}
				
				const towerUploadMetrics: aws.CloudWatch.MetricData = [
					{
						MetricName: 'Upload',
						Dimensions: [ {
							Name: 'Tower',
							Value: headInfo.Metadata?.source as string
						} ],
						Unit: 'Count',
						Value: 1
					},
				];
				if (!Number.isNaN(Number(headInfo.Metadata?.stop_time))) {
					const towerName = headInfo.Metadata?.source as string;
					const stationName = towerToStation[towerName] || towerName;
					towerUploadMetrics.push({
						MetricName: 'UploadTime',
						Dimensions: [ {
							Name: 'Tower',
							Value: stationName,
						} ],
						Unit: 'Seconds',
						Value: Math.round(addedTime / 1000) - Number(headInfo.Metadata?.stop_time),
					});
				}

				await cloudwatch.putMetricData({
					Namespace: 'DTR Metrics',
					MetricData: towerUploadMetrics,
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
				if (typeof talkgroupsToTag[config.tg] !== 'undefined') {
					fileTag = talkgroupsToTag[config.tg];
				}
			}
			await dynamodb.putItem(body).promise();

			let doTranscriptOnly: boolean = false;
			const isPage: boolean = !!body.Item.Tone?.BOOL;
			let shouldDoTranscript: boolean = body.Item.Emergency?.N === '1'
				|| isPage;
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
						'#t': 'Tone',
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
						},
						':t': {
							BOOL: headInfo.Metadata?.tone === 'true',
						},
					},
					KeyConditionExpression: '#tg = :tg AND #st BETWEEN :st1 AND :st2',
					FilterExpression: '#e = :e AND #t = :t',
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
						doTranscriptOnly = true; // So we don't accidentally double page
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
						const keepingCurrentItem: boolean = keptItem.Key.S === Key;
						if (isPage) {
							logger.error('itemsToDelete', itemsToDelete);
							logger.error('keptItem', keptItem);
							logger.error('body', body.Item);
						} else {
							logger.debug('itemsToDelete', itemsToDelete);
							logger.debug('keptItem', keptItem);
							logger.debug('body', body.Item);
						}
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
						if (shouldDoTranscript && !keepingCurrentItem) {
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
								.catch(e => logger.error('parseRecord', 'translate table', e)));
						}
						if (transcript !== null && keepingCurrentItem) {
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

						// Check to see if we need to send a paging message
						if (
							isPage &&
							keepingCurrentItem &&
							!itemsToDelete.reduce((agg, item) => agg || !!(item.PageSent?.BOOL), false)
						) {
							// Update the current item to indicate a page will have been sent
							doTranscriptOnly = false;
							promises.push(dynamodb.updateItem({
								TableName: dtrTable,
								Key: {
									Talkgroup: keptItem.Talkgroup,
									Added: keptItem.Added,
								},
								ExpressionAttributeNames: {
									'#ps': 'PageSent',
								},
								ExpressionAttributeValues: {
									':ps': {
										BOOL: true,
									},
								},
								UpdateExpression: 'SET #ps = :ps',
							}).promise());
						}

						// Check to see if we should redo the transcription
						if (
							!keepingCurrentItem || // We're not saving this file
							!shouldDoTranscript // This file doesn't need a transcript
						) {
							logger.debug('Duplicate, no transcript or page');
							await Promise.all(promises);
							return;
						}
					} else if (isPage) {
						promises.push(dynamodb.updateItem({
							TableName: dtrTable,
							Key: {
								Talkgroup: body.Item.Talkgroup,
								Added: body.Item.Added,
							},
							ExpressionAttributeNames: {
								'#ps': 'PageSent',
							},
							ExpressionAttributeValues: {
								':ps': {
									BOOL: true,
								},
							},
							UpdateExpression: 'SET #ps = :ps',
						}).promise());
					}
				} else if (shouldDoTranscript) {
					logger.debug('body', body.Item);
				}
			}

			if (shouldDoTranscript) {
				const transcribeJobName = `${body.Item.Talkgroup.N}-${Date.now()}`;
				const toneFile = Key.split('/')[2] || Key.split('/')[1];
				const Tags: aws.TranscribeService.TagList = [
					{ Key: 'Talkgroup', Value: body.Item.Talkgroup?.N as string },
					{ Key: 'File', Value: toneFile },
					{ Key: 'FileKey', Value: Key },
					{ Key: 'IsPage', Value: body.Item.Tone?.BOOL ? 'y' : 'n' },
				];
				if (fileTag !== null) {
					Tags.push({
						Key: 'CostCenter',
						Value: fileTag,
					});
				}
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
					Tags,
				}).promise());

				if (!doTranscriptOnly && body.Item.Tone?.BOOL) {
					logger.debug('Transcript and page');
					const queueMessage: PageBody = {
						action: 'page',
						tg: Number(body.Item.Talkgroup?.N) as PagingTalkgroup,
						key: toneFile,
						len: Number(body.Item.Len.N)
					};
					promises.push(sqs.sendMessage({
						MessageBody: JSON.stringify(queueMessage),
						QueueUrl: sqsQueue
					}).promise());
				} else {
					// Exit early if we just wanted to kick off the transcript
					logger.debug('Transcript only');
					await Promise.all(promises);
					return;
				}
			}

			const talkgroupCreate: Promise<any> = (async () => {
				const item = await dynamodb.query({
					TableName: talkgroupTable,
					ExpressionAttributeNames: {
						'#id': 'ID',
					},
					ExpressionAttributeValues: {
						':id': {
							N: body.Item?.Talkgroup?.N
						}
					},
					KeyConditionExpression: '#id = :id',
				}).promise();

				if (!item.Items) {
					await dynamodb.updateItem({
						TableName: talkgroupTable,
						ExpressionAttributeNames: {
							'#iu': 'InUse'
						},
						ExpressionAttributeValues: {
							':iu': {
								S: 'Y'
							}
						},
						Key: {
							'ID': {
								N: body.Item?.Talkgroup?.N
							}
						},
						UpdateExpression: 'SET #iu = :iu'
					}).promise();
				}
			})();
			promises.push(talkgroupCreate);

			try {
				await Promise.all(promises);
			} catch (e) {
				await incrementMetric('Error', {
					source: metricSource,
					type: 'Talkgroup Update'
				});
				logger.error('parseRecord', 'talkgroup and devices', e);
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
				logger.info('parseRecord', 'delete', body);
				const promises: Promise<any>[] = [];
				promises.push(dynamodb.deleteItem(body).promise());
			
				await Promise.all(promises);
			} else {
				logger.error('parseRecord', 'delete', 'not found', Key);
			}
		}
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
		});
		logger.error('parseRecord', e);
	}
}

export async function main(event: lambda.S3Event): Promise<void> {
	logger.trace('main', ...arguments);
	try {
		await Promise.all(event.Records.map(parseRecord));
	} catch (e) {
		logger.error('main', e);
	}
}
