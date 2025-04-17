import {
  APIGatewayProxyEvent, APIGatewayProxyResult
} from 'aws-lambda';

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log(event);

  return {
    statusCode: 500,
    body: 'Incorrect endpoint',
  };
}
