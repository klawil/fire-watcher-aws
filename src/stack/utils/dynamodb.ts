import * as aws from 'aws-sdk';
import { getLogger } from '../../logic/logger';

const logger = getLogger('dynamodb');

type DynamoDbValues = boolean | number | string | undefined | aws.DynamoDB.AttributeValue | DynamoDbValues[];

/**
 * @deprecated The method should not be used
 */
export function parseDynamoDbAttributeValue(value: aws.DynamoDB.AttributeValue): DynamoDbValues {
	logger.trace('parseDynamoDbAttributeValue', value);
	if (typeof value.S !== 'undefined') {
		return value.S;
	} else if (typeof value.N !== 'undefined') {
		return parseFloat(value.N as string);
	} else if (typeof value.BOOL !== 'undefined') {
		return value.BOOL;
	} else if (typeof value.L !== 'undefined') {
		return value.L?.map(parseDynamoDbAttributeValue);
	} else if (typeof value.NS !== 'undefined') {
		return value.NS?.map(val => parseFloat(val));
	} else if (typeof value.SS !== 'undefined') {
		return value.SS;
	} else if (typeof value.M !== 'undefined') {
		return parseDynamoDbAttributeMap(value.M);
	}

	return value;
}

interface NewObject {
	[key: string]: DynamoDbValues | NewObject;
}

/**
 * @deprecated The method should not be used
 */
export function parseDynamoDbAttributeMap(item: aws.DynamoDB.AttributeMap): NewObject {
	logger.trace('parseDynamoDbAttributeMap', item);
	const newObj: NewObject = {};

	Object.keys(item)
		.forEach(key => {
			newObj[key] = parseDynamoDbAttributeValue(item[key]);
		});

	return newObj;
}
