import { DocumentClient } from 'aws-sdk/clients/dynamodb';

import {
  TypedDeleteItemInput, TypedDeleteItemOutput,
  TypedGetInput,
  TypedGetOutput, TypedPutItemInput, TypedPutItemOutput, TypedQueryInput, TypedQueryOutput, TypedScanInput, TypedScanOutput,
  TypedUpdateInput, TypedUpdateOutput
} from '@/types/backend/dynamo';

const docClient = new DocumentClient();

export const TABLE_FILE = process.env.TABLE_FILE;
export const TABLE_USER = process.env.TABLE_USER;
export const TABLE_TEXT = process.env.TABLE_TEXT;
export const TABLE_SITE = process.env.TABLE_SITE;
export const TABLE_TALKGROUP = process.env.TABLE_TALKGROUP;
export const TABLE_FILE_TRANSLATION = process.env.TABLE_DTR_TRANSLATION;
export const TABLE_STATUS = process.env.TABLE_STATUS;

export async function typedUpdate<T extends object>(
  config: TypedUpdateInput<T>
): Promise<TypedUpdateOutput<T>> {
  return (await docClient.update(config).promise()) as TypedUpdateOutput<T>;
}

export async function typedGet<T extends object>(
  config: TypedGetInput<T>
): Promise<TypedGetOutput<T>> {
  return (await docClient.get(config).promise()) as TypedGetOutput<T>;
}

export async function typedQuery<T extends object>(
  config: TypedQueryInput<T>
): Promise<TypedQueryOutput<T>> {
  return (await docClient.query(config).promise()) as TypedQueryOutput<T>;
}

export async function typedScan<T extends object>(
  config: TypedScanInput<T>
): Promise<TypedScanOutput<T>> {
  return (await docClient.scan(config).promise()) as TypedScanOutput<T>;
}

export async function typedDeleteItem<T extends object>(
  config: TypedDeleteItemInput<T>
): Promise<TypedDeleteItemOutput<T>> {
  return (await docClient.delete(config).promise()) as TypedDeleteItemOutput<T>;
}

export async function typedPutItem<T extends object>(
  config: TypedPutItemInput<T>
): Promise<TypedPutItemOutput<T>> {
  return (await docClient.put(config).promise()) as TypedPutItemOutput<T>;
}
