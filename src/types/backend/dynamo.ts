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
> extends AWS.DynamoDB.DocumentClient.UpdateItemInput {
  ExpressionAttributeNames: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedUpdateOutput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.UpdateItemOutput {
  Attributes?: Partial<T>;
}

export interface TypedGetInput<T extends object> extends AWS.DynamoDB.DocumentClient.GetItemInput {
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedGetOutput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.GetItemOutput {
  Item?: T;
}

export interface TypedQueryInput<T extends object> extends AWS.DynamoDB.DocumentClient.QueryInput {
  ExpressionAttributeNames?: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
}
export interface TypedQueryOutput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.QueryOutput {
  Items?: T[];
}

export interface TypedScanInput<T extends object> extends AWS.DynamoDB.DocumentClient.ScanInput {
  ExpressionAttributeNames?: ExpressionAttributeNames<T>;
  ExpressionAttributeValues?: ExpressionAttributeValues<T>;
}
export interface TypedScanOutput<T extends object> extends AWS.DynamoDB.DocumentClient.ScanOutput {
  Items?: T[];
}

export interface TypedDeleteItemInput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.DeleteItemInput {
  Key: {
    [key in RequiredKeys<T>]: T[key];
  };
}
export interface TypedDeleteItemOutput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.DeleteItemOutput {
  Attributes?: Partial<T>;
}

export interface TypedPutItemInput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.PutItemInput {
  Item: T;
}
export interface TypedPutItemOutput<
  T extends object
> extends AWS.DynamoDB.DocumentClient.PutItemOutput {
  Attributes?: Partial<T>;
}
