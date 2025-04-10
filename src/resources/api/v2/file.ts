import { getLogger } from '@/utils/common/logger';
import {
  api404Body, generateApi400Body
} from '@/types/api/_shared';
import {
  FullFileObject, GetFileApi, getFileApiParamsValidator
} from '@/types/api/files';
import {
  handleResourceApi, LambdaApiFunction
} from './_base';
import {
  TABLE_FILE, typedGet
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';

const logger = getLogger('file');

const dtrIdRegex = /^(\d+)-(\d+)$/;

const GET: LambdaApiFunction<GetFileApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Validate the parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetFileApi['params']>(
    event.pathParameters,
    getFileApiParamsValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) return [
    400,
    generateApi400Body(paramsErrors),
  ];

  const idParts = params.id.match(dtrIdRegex);
  if (idParts === null) return [
    404,
    api404Body,
  ];

  const file = await typedGet<FullFileObject>({
    TableName: TABLE_FILE,
    Key: {
      Talkgroup: Number(idParts[1]),
      Added: Number(idParts[2]),
    },
  });

  if (!file.Item) return [
    404,
    api404Body,
  ];

  return [
    200,
    file.Item as GetFileApi['responses'][200],
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
