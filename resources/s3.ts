import * as lambda from 'aws-lambda';
import * as aws from 'aws-sdk';

const s3 = new aws.S3();
const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const trafficTable = process.env.TABLE_TRAFFIC as string;
const queueUrl = process.env.SQS_QUEUE as string;

async function parseRecord(record: lambda.S3EventRecord): Promise<void> {
	const Bucket = record.s3.bucket.name;
	const Key = record.s3.object.key;

	if (record.eventName.indexOf('ObjectCreated') === 0) {
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
		console.log(`Create: ${JSON.stringify(body)}`)

		await dynamodb.putItem(body).promise();
	} else {
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
		console.log(`Delete: ${JSON.stringify(body)}`)
		await dynamodb.deleteItem(body).promise();
	}
}

export async function main(event: lambda.S3Event): Promise<void> {
	try {
		await Promise.all(event.Records.map(parseRecord));
	} catch (e) {
		console.error(e);
	}
}
