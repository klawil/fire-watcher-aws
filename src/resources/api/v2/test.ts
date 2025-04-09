import { APIGatewayProxyEvent } from "aws-lambda";
import { getCurrentUser } from "./_base";
import { api403Body } from "@/types/api/_shared";

const lambdaNameEnvRegex = /^(A|I)_([0-9A-Z_]+)_FN_NAME$/;
const lambdaNames: {
  [key: string]: {
    name: string;
    label: string;
  };
} = Object.keys(process.env)
  .filter(key => key.endsWith('_FN_NAME') && lambdaNameEnvRegex.test(key))
  .reduce((agg: typeof lambdaNames, key) => {
    const value = process.env[key];
    const pieces = key.match(lambdaNameEnvRegex);
    if (
      typeof value === 'undefined' ||
      pieces === null
    ) return agg;

    agg[key] = {
      name: value === 'self'
        ? process.env.AWS_LAMBDA_FUNCTION_NAME as string
        : value,
      label: pieces[1] === 'I'
        ? pieces[2].toLowerCase()
        : pieces[2].replace(/_/g, '/').toLowerCase(),
    };

    return agg;
  }, {});

export async function main(event: APIGatewayProxyEvent) {
  const [ user, userPerms ] = await getCurrentUser(event);
  console.log(user, userPerms);
  if (
    user === null ||
    !userPerms.isAdmin
  ) return {
    statusCode: 403,
    body: JSON.stringify(api403Body),
  };

  const keys = Object.keys(process.env)
    .filter(key => key.endsWith('_FN_NAME'));

  return {
    statusCode: 200,
    body: JSON.stringify({
      keys,
      lambdaNames,
    }),
  };
}
