import { getLogger } from '../../../../logic/logger';
import { api404Body } from '@/types/api/_shared';
import { FullFileObject, GetFileApi } from '@/types/api/files';
import { handleResourceApi, LambdaApiFunction } from './_base';
import { TABLE_FILE, typedGet } from '@/stack/utils/dynamoTyped';

const logger = getLogger('file');

const dtrIdRegex = /^(\d+)-(\d+)$/;

const GET: LambdaApiFunction<GetFileApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // @TODO - implement the validator
  const idParts = (event.pathParameters?.id || '').match(dtrIdRegex);
  if (idParts === null)
    return [ 404, api404Body ];

  const file = await typedGet<FullFileObject>({
    TableName: TABLE_FILE,
    Key: {
      Talkgroup: Number(idParts[1]),
      Added: Number(idParts[2]),
    }
  });

  if (!file.Item)
    return [ 404, api404Body ];

  return [ 200, file.Item as GetFileApi['responses'][200] ];
}

export const main = handleResourceApi.bind(null, {
  GET,
});
