import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  parseJsonBody
} from './_utils';

import {
  api200Body,
  api401Body, api403Body,
  generateApi400Body
} from '@/types/api/_shared';
import {
  AdjacentSiteBodyItem,
  FullSiteObject, GetAllSitesApi,
  UpdateSitesApi,
  adjacentSiteItemValidator,
  updateSitesBodyValidator
} from '@/types/api/sites';
import { SiteStatusQueueItem } from '@/types/backend/queue';
import {
  TABLE_SITE, typedQuery
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('stack/resources/api/v2/sites');
const sqs = new SQSClient();

const GET: LambdaApiFunction<GetAllSitesApi> = async function (
  event,
  user,
  userPerms
) {
  logger.trace('GET', ...arguments);

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

  // Retrieve the sites
  const sites = await typedQuery<FullSiteObject>({
    TableName: TABLE_SITE,
    IndexName: 'active',
    ExpressionAttributeNames: { '#IsActive': 'IsActive', },
    ExpressionAttributeValues: { ':IsActive': 'y', },
    KeyConditionExpression: '#IsActive = :IsActive',
  });

  return [
    200,
    {
      count: (sites.Items || []).length,
      sites: sites.Items || [],
    },
  ];
};

const POST: LambdaApiFunction<UpdateSitesApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Parse and validate the body
  const [
    body,
    bodyErrors,
  ] = parseJsonBody(
    event.body,
    updateSitesBodyValidator
  );
  if (
    bodyErrors.length > 0 ||
    body === null
  ) {
    return [
      400,
      generateApi400Body(bodyErrors),
    ];
  }

  // Parse each item
  const validItems: AdjacentSiteBodyItem[] = [];
  const allItemErrors: string[] = [];
  body.adjacent.forEach((itemList, idx1) => {
    if (itemList === '') {
      return;
    }

    itemList.forEach((item, idx2) => {
      const [
        itemParsed,
        itemErrors,
      ] = validateObject(
        item,
        adjacentSiteItemValidator
      );

      if (itemErrors.length > 0) {
        allItemErrors.push(...itemErrors.map(v => `${idx1}-${idx2}-${v}`));
      } else if (itemParsed === null) {
        allItemErrors.push(`${idx1}-${idx2}-null`);
      } else {
        validItems.push(itemParsed);
      }
    });
  });

  // Send the items into the queue
  if (validItems.length > 0) {
    const queueMessage: SiteStatusQueueItem = {
      action: 'site-status',
      sites: {},
    };

    // Consolidate the rows
    validItems.forEach(site => {
      const siteId = `${site.rfss}-${site.site}`;
      const system = site.sys_shortname;

      if (typeof queueMessage.sites[siteId] === 'undefined') {
        queueMessage.sites[siteId] = {
          UpdateTime: { [system]: Number(site.time), },
          ConvChannel: { [system]: site.conv_ch, },
          SiteFailed: { [system]: site.site_failed, },
          ValidInfo: { [system]: site.valid_info, },
          CompositeCtrl: { [system]: site.composite_ctrl, },
          ActiveConn: { [system]: site.active_conn, },
          BackupCtrl: { [system]: site.backup_ctrl, },
          NoServReq: { [system]: site.no_service_req, },
          SupportData: { [system]: site.supports_data, },
          SupportVoice: { [system]: site.supports_voice, },
          SupportReg: { [system]: site.supports_registration, },
          SupportAuth: { [system]: site.supports_authentication, },
        };
        return;
      }

      queueMessage.sites[siteId].UpdateTime[system] = Number(site.time);
      queueMessage.sites[siteId].ConvChannel[system] = site.conv_ch;
      queueMessage.sites[siteId].SiteFailed[system] = site.site_failed;
      queueMessage.sites[siteId].ValidInfo[system] = site.valid_info;
      queueMessage.sites[siteId].CompositeCtrl[system] = site.composite_ctrl;
      queueMessage.sites[siteId].ActiveConn[system] = site.active_conn;
      queueMessage.sites[siteId].BackupCtrl[system] = site.backup_ctrl;
      queueMessage.sites[siteId].NoServReq[system] = site.no_service_req;
      queueMessage.sites[siteId].SupportData[system] = site.supports_data;
      queueMessage.sites[siteId].SupportVoice[system] = site.supports_voice;
      queueMessage.sites[siteId].SupportReg[system] = site.supports_registration;
      queueMessage.sites[siteId].SupportAuth[system] = site.supports_authentication;
    });

    // Send the message
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE,
      MessageBody: JSON.stringify(queueMessage),
    }));
  }

  // Return the errors
  if (allItemErrors.length > 0) {
    return [
      400,
      generateApi400Body(allItemErrors),
    ];
  }
  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
