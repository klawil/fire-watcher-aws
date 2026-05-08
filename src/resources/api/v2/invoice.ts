import {
  GetObjectCommand, S3Client
} from '@aws-sdk/client-s3';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateRequest } from './_utils';

import {
  api401Body, api403Body, api404Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  GetInvoiceApi, Invoice, UpdateInvoiceApi,
  invoiceApiParamsValidator,
  updateInvoiceApiBodyValidator
} from '@/types/api/invoices';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import {
  BUCKET_EMAIL, TABLE_INVOICE
} from '@/types/backend/environment';
import {
  typedGet,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/invoice');
const s3 = new S3Client();

function getTodayDateStringUtc() {
  return new Date().toISOString()
    .slice(0, 10);
}

function isS3NotFoundError(error: unknown) {
  const err = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  };

  return err.name === 'NoSuchKey' ||
    err.name === 'NotFound' ||
    err.Code === 'NoSuchKey' ||
    err.code === 'NoSuchKey' ||
    err.$metadata?.httpStatusCode === 404;
}

const GET: LambdaApiFunction<GetInvoiceApi> = async function (event, user, userPerms) {
  logger.debug('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  const [
    params,
    paramsErrors,
  ] = validateObject<GetInvoiceApi['params']>(
    event.pathParameters,
    invoiceApiParamsValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(paramsErrors),
    ];
  }
  const invoiceId = params.id;

  // Get the invoice from DynamoDB
  const invoiceResult = await typedGet<Invoice>({
    TableName: TABLE_INVOICE(),
    Key: {
      id: invoiceId,
    },
  });

  if (!invoiceResult.Item) {
    return [
      404,
      api404Body,
    ];
  }

  const invoice = invoiceResult.Item;

  // Check permissions - user must be admin of the department
  if (
    typeof invoice.department !== 'string' ||
    (
      !userPerms.adminDepartments.includes(
        invoice.department as typeof userPerms.adminDepartments[number]
      ) &&
      !user.isDistrictAdmin
    )
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Retrieve the PDF from S3
  if (!invoice.s3Location) {
    return [
      404,
      api404Body,
    ];
  }

  try {
    const s3Result = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_EMAIL(),
      Key: invoice.s3Location,
    }));

    if (!s3Result.Body) {
      return [
        404,
        api404Body,
      ];
    }

    const pdfBuffer = await s3Result.Body.transformToByteArray();

    return [
      200,
      Buffer.from(pdfBuffer),
      {
        'content-disposition': [ `attachment; filename="invoice-${invoiceId}.pdf"`, ],
        'content-type': [ 'application/pdf', ],
      },
      'application/pdf',
    ];
  } catch (e) {
    logger.error(`Error retrieving invoice ${invoiceId} from S3`, e);

    if (isS3NotFoundError(e)) {
      return [
        404,
        api404Body,
      ];
    }

    return [
      500,
      api500Body,
    ];
  }
};

const PATCH: LambdaApiFunction<UpdateInvoiceApi> = async function (event, user, _) {
  logger.debug('PATCH', ...arguments);

  // Authorize the user - only district admins can update invoice paid status
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!user.isDistrictAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  const {
    params,
    body,
    validationErrors,
  } = validateRequest<UpdateInvoiceApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: invoiceApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: updateInvoiceApiBodyValidator,
  });
  if (
    params === null ||
    body === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }
  const invoiceId = params.id;

  if (typeof body.paidDate === 'undefined') {
    return [
      400,
      generateApi400Body('No updatable fields were provided'),
    ];
  }

  // Validate paidDate format if provided
  if (typeof body.paidDate === 'string') {
    // Compare date-only strings in UTC.
    if (body.paidDate > getTodayDateStringUtc()) {
      return [
        400,
        generateApi400Body([ 'paidDate: Date cannot be in the future', ]),
      ];
    }
  }

  // Get the invoice to verify it exists
  const invoiceResult = await typedGet<Invoice>({
    TableName: TABLE_INVOICE(),
    Key: {
      id: invoiceId,
    },
  });

  if (!invoiceResult.Item) {
    return [
      404,
      api404Body,
    ];
  }

  // Update the invoice
  try {
    const updateInput: TypedUpdateInput<Invoice> = {
      TableName: TABLE_INVOICE(),
      Key: {
        id: invoiceId,
      },
      ExpressionAttributeNames: {
        '#paidDate': 'paidDate',
      },
      ReturnValues: 'ALL_NEW',
    };

    if (typeof body.paidDate === 'string') {
      updateInput.ExpressionAttributeValues = {
        ':paidDate': body.paidDate,
      };
      updateInput.UpdateExpression = 'SET #paidDate = :paidDate';
    } else if (body.paidDate === null) {
      updateInput.UpdateExpression = 'REMOVE #paidDate';
    }

    const result = await typedUpdate<Invoice>(updateInput);

    if (!result.Attributes) {
      return [
        500,
        api500Body,
      ];
    }

    const updatedInvoice: Invoice = {
      ...invoiceResult.Item,
      ...result.Attributes,
    };

    return [
      200,
      updatedInvoice,
    ];
  } catch (e) {
    logger.error(`Error updating invoice ${invoiceId}`, e);
    return [
      500,
      api500Body,
    ];
  }
};

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
});
