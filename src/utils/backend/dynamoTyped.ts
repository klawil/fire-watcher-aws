import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

import {
  TypedDeleteItemInput, TypedDeleteItemOutput, TypedGetInput, TypedGetOutput, TypedPutItemInput,
  TypedPutItemOutput, TypedQueryInput, TypedQueryOutput, TypedScanInput, TypedScanOutput,
  TypedUpdateInput, TypedUpdateOutput
} from '@/types/backend/dynamo';

const client = new DynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_FILE = process.env.TABLE_FILE;
export const TABLE_USER = process.env.TABLE_USER;
export const TABLE_TEXT = process.env.TABLE_TEXT;
export const TABLE_SITE = process.env.TABLE_SITE;
export const TABLE_TALKGROUP = process.env.TABLE_TALKGROUP;
export const TABLE_FILE_TRANSLATION = process.env.TABLE_DTR_TRANSLATION;
export const TABLE_STATUS = process.env.TABLE_STATUS;

function removeSets<T extends object>(input: T): T {
  const output = { ...input, };
  (Object.keys(output) as (keyof T)[]).forEach(key => {
    if (!(output[key] instanceof Set)) {
      return;
    }

    output[key] =
      [ ...output[key], ] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  return output;
}

export async function typedUpdate<T extends object>(
  config: TypedUpdateInput<T>
): Promise<TypedUpdateOutput<T>> {
  const output = (await dynamoDb.send(new UpdateCommand(config))) as TypedUpdateOutput<T>;

  if (output.Attributes) {
    output.Attributes = removeSets(output.Attributes);
  }

  return output;
}

export async function typedGet<T extends object>(
  config: TypedGetInput<T>
): Promise<TypedGetOutput<T>> {
  const output = (await dynamoDb.send(new GetCommand(config))) as TypedGetOutput<T>;

  if (output.Item) {
    output.Item = removeSets(output.Item);
  }

  return output;
}

export async function typedQuery<T extends object>(
  config: TypedQueryInput<T>
): Promise<TypedQueryOutput<T>> {
  const output = (await dynamoDb.send(new QueryCommand(config))) as TypedQueryOutput<T>;

  if (output.Items) {
    output.Items = output.Items.map(v => removeSets(v));
  }

  return output;
}

export async function typedScan<T extends object>(
  config: TypedScanInput<T>
): Promise<TypedScanOutput<T>> {
  const output = (await dynamoDb.send(new ScanCommand(config))) as TypedScanOutput<T>;

  if (output.Items) {
    output.Items = output.Items.map(v => removeSets(v));
  }

  return output;
}

export async function typedDeleteItem<T extends object>(
  config: TypedDeleteItemInput<T>
): Promise<TypedDeleteItemOutput<T>> {
  const output = (await dynamoDb.send(new DeleteCommand(config))) as TypedDeleteItemOutput<T>;

  if (output.Attributes) {
    output.Attributes = removeSets(output.Attributes);
  }

  return output;
}

export async function typedPutItem<T extends object>(
  config: TypedPutItemInput<T>
): Promise<TypedPutItemOutput<T>> {
  const output = (await dynamoDb.send(new PutCommand(config))) as TypedPutItemOutput<T>;

  if (output.Attributes) {
    output.Attributes = removeSets(output.Attributes);
  }

  return output;
}
