import {
  DeleteCommandInput,
  DeleteCommandOutput,
  GetCommandInput,
  GetCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  ScanCommandOutput,
  UpdateCommandInput, UpdateCommandOutput
} from '@aws-sdk/lib-dynamodb';

type RequiredKeys<T extends object> = {
  [key in keyof T]: undefined extends T[key] ? never : key;
}[keyof T];

type StringExcept<K extends string> = string extends K ? never : string;

type ExpressionAttributeValues<T extends object> = {
  [key in StringExcept<Extract<keyof T, string>> as `:${key}`]: any; // eslint-disable-line
} & {
  [key in Extract<keyof T, string> as `:${key}`]?: T[key];
};

type ExpressionAttributeNames<T extends object> = {
  [key in StringExcept<Extract<keyof T, string>> as `#${key}`]: string;
} & {
  [key in Extract<keyof T, string> as `#${key}`]?: key;
};

export interface TypedUpdateInput<
  T extends object
> extends UpdateCommandInput {
  ExpressionAttributeNames: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedUpdateOutput<
  T extends object
> extends UpdateCommandOutput {
  Attributes?: Partial<T>;
}

export interface TypedGetInput<T extends object> extends GetCommandInput {
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedGetOutput<
  T extends object
> extends GetCommandOutput {
  Item?: T;
}

export interface TypedQueryInput<T extends object> extends QueryCommandInput {
  ExpressionAttributeNames?: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
}
export interface TypedQueryOutput<
  T extends object
> extends QueryCommandOutput {
  Items?: T[];
}

export interface TypedScanInput<T extends object> extends ScanCommandInput {
  ExpressionAttributeNames?: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
}
export interface TypedScanOutput<T extends object> extends ScanCommandOutput {
  Items?: T[];
}

export interface TypedDeleteItemInput<
  T extends object
> extends DeleteCommandInput {
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedDeleteItemOutput<
  T extends object
> extends DeleteCommandOutput {
  Attributes?: Partial<T>;
}

export interface TypedPutItemInput<
  T extends object
> extends PutCommandInput {
  Item: T;
}
export interface TypedPutItemOutput<
  T extends object
> extends PutCommandOutput {
  Attributes?: Partial<T>;
}
