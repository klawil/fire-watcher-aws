import { BaseClientMock } from './_base';

export const DynamoDBDocumentClientMock = new BaseClientMock();

export const DynamoDBDocumentClient = {
  from: DynamoDBDocumentClientMock.client,
};
export const DeleteCommand = DynamoDBDocumentClientMock.getCommand('delete');
export const GetCommand = DynamoDBDocumentClientMock.getCommand('get');
export const PutCommand = DynamoDBDocumentClientMock.getCommand('put');
export const QueryCommand = DynamoDBDocumentClientMock.getCommand('query');
export const ScanCommand = DynamoDBDocumentClientMock.getCommand('scan');
export const UpdateCommand = DynamoDBDocumentClientMock.getCommand('update');
