import { TypedUpdateInput, TypedGetOutput, TypedUpdateOutput, TypedGetInput, TypedQueryInput, TypedQueryOutput, TypedScanInput, TypedScanOutput, TypedDeleteItemInput, TypedDeleteItemOutput, TypedPutItemInput, TypedPutItemOutput } from "@/types/backend/dynamo";
import { DocumentClient } from "aws-sdk/clients/dynamodb";

const docClient = new DocumentClient();

export const TABLE_FILE = process.env.TABLE_FILE as string;
export const TABLE_USER = process.env.TABLE_USER as string;
export const TABLE_TEXT = process.env.TABLE_TEXT as string;
export const TABLE_SITE = process.env.TABLE_SITE as string;
export const TABLE_TALKGROUP = process.env.TABLE_TALKGROUP as string;

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
