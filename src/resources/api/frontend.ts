import {
  APIGatewayProxyResult
} from 'aws-lambda';

import { api403Response } from '@/types/api/_shared';

export async function main(): Promise<APIGatewayProxyResult> {
  return api403Response;
}
