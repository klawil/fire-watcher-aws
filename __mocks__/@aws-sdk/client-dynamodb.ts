import { BaseClientMock } from './_base';

export const DynamoDBMock = new BaseClientMock();

export const DynamoDBClient = DynamoDBMock.client;
