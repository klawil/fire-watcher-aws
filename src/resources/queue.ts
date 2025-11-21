import * as https from 'https';

import {
  CloudWatchClient, PutMetricDataCommand
} from '@aws-sdk/client-cloudwatch';
import {
  GetObjectCommand, PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand, TranscribeClient
} from '@aws-sdk/client-transcribe';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as lambda from 'aws-lambda';

import {
  getTwilioSecret, twilioPhoneCategories, twilioPhoneNumbers
} from '@/deprecated/utils/general';
import {
  FileTranslationObject, FullFileObject
} from '@/types/api/files';
import { FullSiteObject } from '@/types/api/sites';
import {
  FullUserObject, PagingTalkgroup
} from '@/types/api/users';
import {
  PhoneNumberTypes,
  departmentConfig, pagingTalkgroupConfig
} from '@/types/backend/department';
import {
  TypedGetOutput, TypedUpdateInput
} from '@/types/backend/dynamo';
import {
  ActivateUserQueueItem, PhoneNumberIssueQueueItem, SendPageQueueItem, SendUserAuthCodeQueueItem,
  SiteStatusQueueItem, TranscribeJobResultQueueItem, TwilioTextQueueItem
} from '@/types/backend/queue';
import {
  TABLE_FILE, TABLE_FILE_TRANSLATION, TABLE_SITE, TABLE_USER, typedGet, typedQuery, typedScan,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import {
  getShiftData, shiftNameMappings
} from '@/utils/backend/shiftData';
import {
  getPageNumber, getUserRecipients, saveMessageData, sendMessage
} from '@/utils/backend/texts';
import { getLogger } from '@/utils/common/logger';
import {
  dateToTimeString, fNameToDate, formatPhone, randomString
} from '@/utils/common/strings';
import { getUserPermissions } from '@/utils/common/user';

const logger = getLogger('queue');
const transcribe = new TranscribeClient();
const cloudWatch = new CloudWatchClient();
const s3 = new S3Client();

const cacheBucket = process.env.COSTS_BUCKET;

type WelcomeMessageConfigKeys = 'name' | 'type' | 'pageNumber';
const welcomeMessageParts: {
  welcome: string;
  textGroup: string;
  textPageGroup: string;
  pageGroup: string;
  howToLeave: string;
} = {
  welcome: 'Welcome to the {{name}} {{type}} group!',
  textGroup: 'This number will be used to send and receive messages from other members of the department.\n\nTo send a message to other members of your department, just send a text to this number. Any message you send will show up for others with your name and callsign attached.\n\nYou will receive important announcements from {{pageNumber}}. No-one except department administrators will be able to send announcements from that number.',
  textPageGroup: 'This number will be used to send and receive messages from other members of the department.\n\nIn a moment, you will receive a text from {{pageNumber}} with a link to a sample page similar to what you will receive. That number will only ever send you pages or important announcements.\n\nTo send a message to other members of your department, just send a text to this number. Any message you send will show up for others with your name and callsign attached.',
  pageGroup: 'This number will be used to send pages or important announcements.\n\nIn a moment, you will receive a text with a link to a sample page like that you will receive.',
  howToLeave: 'You can leave this group at any time by texting "STOP" to this number.',
};

const codeTtl = 1000 * 60 * 5; // 5 minutes

type OnCallPeople = {
  service: string;
  onCall: {
    id: string;
    name: string;
  }[];
}[];

function createPageMessage(
  fileKey: string,
  pageTg: PagingTalkgroup,
  number: number | null = null,
  messageId: number | null = null,
  transcript: string | null = null,
  onCall: OnCallPeople | null = null,
  isOnCall: boolean = false
): string {
  logger.trace('createPageMessage', ...arguments);
  const pageConfig = pagingTalkgroupConfig[pageTg];

  if (typeof pageConfig === 'undefined') {
    return `Invalid paging talkgroup - ${pageTg} - ${fileKey}`;
  }

  let pageStr = `${pageConfig.partyBeingPaged} paged `;
  pageStr += `${dateToTimeString(fNameToDate(fileKey))}\n\n`;
  if (isOnCall) {
    pageStr += 'YOU ARE ON CALL\n\n';
  }
  if (transcript !== null) {
    pageStr += `${transcript}\n\n`;
  }
  if (onCall !== null && onCall.length > 0) {
    pageStr += 'On-call crew:';
    if (onCall.length > 1) {
      pageStr += '\n';
    }
    onCall.sort((a, b) => {
      const aName = typeof shiftNameMappings[a.service] !== 'undefined'
        ? shiftNameMappings[a.service]
        : a.service;
      const bName = typeof shiftNameMappings[b.service] !== 'undefined'
        ? shiftNameMappings[b.service]
        : b.service;
      return aName.localeCompare(bName);
    }).forEach(group => {
      if (onCall.length > 1) {
        const serviceName = typeof shiftNameMappings[group.service] !== 'undefined'
          ? shiftNameMappings[group.service]
          : group.service;
        pageStr += `${serviceName}: `;
      } else {
        pageStr += ' ';
      }
      pageStr += `${group.onCall.map(o => o.name).join(', ')}\n`;
    });
    pageStr += '\n';
  }
  pageStr += `https://cofrn.org/text-link?f=${fileKey}&tg=${pageTg}&t=${transcript !== null ? '1' : '0'}`;
  if (number !== null) {
    pageStr += `&p=${number}`;
  }
  if (messageId !== null) {
    pageStr += `&m=${messageId}`;
  }
  return pageStr;
}

async function getOnCallPeople(
  time: number,
  tg: PagingTalkgroup
): Promise<[null | OnCallPeople, string[]]> {
  logger.trace('getOnCallPeople', ...arguments);

  try {
    const pagingConf = pagingTalkgroupConfig[tg];
    if (!pagingConf.aladtecDepartment) {
      return [
        null,
        [],
      ];
    }

    const shiftsPromise = getShiftData();
    const aladTecIdToCallsign = await typedScan<FullUserObject>({
      TableName: TABLE_USER,
      ExpressionAttributeNames: {
        '#aladTecId': 'aladTecId',
      },
      FilterExpression: 'attribute_exists(#aladTecId)',
    })
      .then(r => r.Items || [])
      .then(users => users.reduce((agg: { [key: string]: string }, user) => {
        if (
          typeof user.aladTecId !== 'undefined' &&
          typeof pagingConf.department !== 'undefined' &&
          typeof user[pagingConf.department]?.callSign !== 'undefined'
        ) {
          agg[user.aladTecId] = user[pagingConf.department]?.callSign as string;
        }

        return agg;
      }, {}));
    const shiftData = await shiftsPromise;
    const onCallIds: string[] = [];
    const onCallCrew = shiftData.shifts.reduce((agg: OnCallPeople, shift) => {
      if (
        shift.start > time ||
        shift.end <= time ||
        !pagingConf.aladtecDepartment?.includes(shift.department)
      ) {
        return agg;
      }

      onCallIds.push(shift.id);

      let name = shiftData.people[shift.id] || 'Unknown';
      if (typeof aladTecIdToCallsign[shift.id] !== 'undefined') {
        name += ` [${aladTecIdToCallsign[shift.id]}]`;
      }

      for (let i = 0; i < agg.length; i++) {
        if (agg[i].service === shift.department) {
          agg[i].onCall.push({
            id: shift.id,
            name,
          });
          return agg;
        }
      }

      agg.push({
        service: shift.department,
        onCall: [ {
          id: shift.id,
          name,
        }, ],
      });

      return agg;
    }, [])
      .map(crew => ({
        ...crew,
        onCall: crew.onCall.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return [
      onCallCrew,
      onCallIds,
    ];
  } catch (e) {
    logger.error('getOnCallPeople', e);
    return [
      null,
      [],
    ];
  }
}

interface TranscribeResult {
  jobName: string;
  results: {
    transcripts: {
      transcript: string;
    }[];
    speaker_labels: {
      segments: {
        start_time: string;
        end_time: string;
        speaker_label: string;
      }[];
    },
    items: ({
      type: 'pronunciation';
      start_time: string;
      alternatives: {
        content: string;
      }[];
    } | {
      type: 'punctuation';
      alternatives: {
        content: string;
      }[];
    })[];
  };
}

async function getItemToUpdate(key: string | null): Promise<FullFileObject | null> {
  logger.trace('getItemToUpdate', ...arguments);
  if (key === null) {
    return key;
  }

  let item: FullFileObject | null = null;
  let count = 0;
  do {
    const result = await typedQuery<FullFileObject>({
      TableName: TABLE_FILE,
      IndexName: 'KeyIndex',
      ExpressionAttributeNames: {
        '#Key': 'Key',
      },
      ExpressionAttributeValues: {
        ':Key': key,
      },
      KeyConditionExpression: '#Key = :Key',
    });

    if (!result.Items || result.Items.length === 0) {
      const resultMap: TypedGetOutput<FileTranslationObject> = await typedGet({
        TableName: TABLE_FILE_TRANSLATION,
        Key: {
          Key: key,
        },
      });

      key = resultMap.Item?.NewKey || null;
    } else {
      item = result.Items[0];
    }
  } while (item === null && key !== null && count++ < 10);

  return item;
}

async function handleTranscribe(body: TranscribeJobResultQueueItem) {
  logger.trace('handleTranscribe', ...arguments);
  // Check for the correct transcription job fomat
  if (!(/^\d{4,5}\-\d+$/).test(body.detail.TranscriptionJobName)) {
    throw new Error(`Invalid transcription job name - ${body.detail.TranscriptionJobName}`);
  }

  const transcriptInitTime = new Date();

  // Get the transcription results
  const transcriptionInfo = await transcribe.send(new GetTranscriptionJobCommand({
    TranscriptionJobName: body.detail.TranscriptionJobName,
  }));
  const fileData: string = await new Promise((res, rej) => https.get(
    transcriptionInfo.TranscriptionJob?.Transcript?.TranscriptFileUri as string,
    response => {
      let data = '';

      response.on('data', chunk => data += chunk);
      response.on('end', () => res(data));
    }
  ).on('error', e => rej(e)));
  const result: TranscribeResult = JSON.parse(fileData);

  const transcript: string = result.results.transcripts[0].transcript === ''
    ? 'No voices detected'
    : result.results.transcripts[0].transcript;

  // Build the message
  let messageBody: string = '';
  let updateFilePromise: Promise<unknown> = new Promise(res => res(null));
  let tg: PagingTalkgroup;
  const jobInfo: { [key: string]: string; } = (transcriptionInfo.TranscriptionJob?.Tags || [])
    .reduce((agg: { [key: string]: string; }, value) => {
      if (
        typeof value.Key !== 'undefined' &&
        typeof value.Value !== 'undefined'
      ) {
        agg[value.Key] = value.Value;
      }

      return agg;
    }, {});
  if (jobInfo.Talkgroup) {
    tg = Number(jobInfo.Talkgroup) as PagingTalkgroup;

    updateFilePromise = getItemToUpdate(jobInfo.FileKey as string)
      .then(item => {
        if (item === null) {
          return;
        }

        return typedUpdate<FullFileObject>({
          TableName: TABLE_FILE,
          Key: {
            Talkgroup: item.Talkgroup,
            Added: item.Added,
          },
          ExpressionAttributeNames: {
            '#Transcript': 'Transcript',
          },
          ExpressionAttributeValues: {
            ':Transcript': transcript,
          },
          UpdateExpression: 'SET #Transcript = :Transcript',
        });
      });
  } else {
    tg = Number(body.detail.TranscriptionJobName.split('-')[0]) as PagingTalkgroup;
    messageBody = `Transcript for ${pagingTalkgroupConfig[tg].partyBeingPaged} page:\n\n${transcript}\n\nCurrent radio traffic: https://cofrn.org/?tg=${pagingTalkgroupConfig[tg].linkPreset}`;
  }

  // Exit early if this is transcribing an emergency transmission
  if (jobInfo.IsPage === 'n') {
    await updateFilePromise;
    return;
  }

  // Send the health metrics
  const pageTime = fNameToDate(jobInfo.File);
  const lenMs = typeof jobInfo.Duration !== 'undefined' && (/^[0-9]+$/).test(jobInfo.Duration)
    ? Number(jobInfo.Duration) * 1000
    : 0;
  const metricPromise = cloudWatch.send(new PutMetricDataCommand({
    Namespace: 'Twilio Health',
    MetricData: [ {
      MetricName: 'PageToTranscript',
      Timestamp: pageTime,
      Unit: 'Milliseconds',
      Value: transcriptInitTime.getTime() - pageTime.getTime() - lenMs,
    }, ],
  }));

  // Finish processing the shift data
  const [
    onCallCrew,
    onCallIds,
  ] = await getOnCallPeople(pageTime.getTime(), tg);

  if (messageBody === '') {
    messageBody = createPageMessage(
      jobInfo.File as string,
      tg,
      null,
      null,
      transcript,
      onCallCrew,
      false
    );
  }

  // Get recipients and send
  const recipients = (await getUserRecipients('all', tg))
    .filter(r => r.getTranscript);
  const messageId = Date.now();
  const insertMessage = saveMessageData(
    'transcript',
    messageId,
    recipients.length,
    messageBody,
    [],
    jobInfo.File || null,
    tg
  );

  if (jobInfo.File) {
    await Promise.all(recipients
      .map(async phone => sendMessage(
        'transcript',
        messageId,
        phone.phone,
        await getPageNumber(phone),
        createPageMessage(
          jobInfo.File as string,
          tg,
          phone.phone,
          messageId,
          transcript,
          phone.getOncallInfo ? onCallCrew : null,
          phone.getOncallInfo && typeof phone.aladTecId !== 'undefined'
            ? onCallIds.includes(phone.aladTecId)
            : false
        ),
        []
      )));
  } else {
    await Promise.all(recipients
      .map(async number => sendMessage(
        'transcript',
        messageId,
        number.phone,
        await getPageNumber(number),
        messageBody,
        []
      )));
  }
  await insertMessage;
  await updateFilePromise;
  await metricPromise;
}

const applePrefixes = [
  'Liked',
  'Loved',
  'Disliked',
  'Laughed at',
  'Questioned',
];
const emojiRegex = / to “/;

async function handleTwilioText(body: TwilioTextQueueItem) {
  logger.trace('handleTwilioText', ...arguments);

  // Pull out the phone number config
  const phoneNumberConfigs = await twilioPhoneNumbers();
  const phoneNumberConfig = phoneNumberConfigs[body.body.To];
  if (typeof phoneNumberConfig === 'undefined') {
    throw new Error(`Unable to find config for phone number - ${body.body.To}`);
  }
  if (typeof phoneNumberConfig.department === 'undefined') {
    throw new Error('Text to number not associated with any department');
  }
  const depConfig = departmentConfig[phoneNumberConfig.department];

  // Check for messages that should not be sent to the group
  const msgBody = body.body.Body;
  const doNotSend = (
    msgBody.includes('I\'m Driving') && msgBody.includes('Sent from My Car')
  ) ||
    applePrefixes.some(prefix => msgBody.startsWith(prefix)) ||
    emojiRegex.test(msgBody);

  // Get the sending user's permissions
  const userPerms = getUserPermissions(body.user);

  // Determine if this is an announcement or not
  let isAnnouncement: boolean = false;
  let includeSender: boolean = false;
  if (phoneNumberConfig.type === 'page') {
    includeSender = true;
    isAnnouncement = userPerms.adminDepartments.includes(phoneNumberConfig.department);
  }
  if (!isAnnouncement && typeof depConfig.textPhone === 'undefined') {
    throw new Error('Tried to send group text on department where that is not available');
  }

  // Determine if this is a test or not
  const isTest = !!body.user.isTest;

  // Get the recipients
  const recipients = (await getUserRecipients(phoneNumberConfig.department, null, isTest))
    .filter(number => {
      if (doNotSend) {
        return false;
      }

      if (isTest) {
        return true;
      }

      return includeSender ||
        number.phone !== body.user.phone;
    });

  // Build the message
  const sendingUserCallsign = body.user[phoneNumberConfig.department]?.callSign || null;
  const sendingUserInfo = `${body.user.fName} ${body.user.lName}${sendingUserCallsign !== null ? ` (${sendingUserCallsign})` : ''}`;
  const messageBody = `${isAnnouncement ? `${depConfig.shortName} Announcement` : sendingUserInfo}: ${body.body.Body}${isAnnouncement ? ` - ${sendingUserInfo}` : ''}`;
  const mediaUrls: string[] = Object.keys(body.body)
    .filter(key => key.indexOf('MediaUrl') === 0)
    .map(key => body.body[key as keyof TwilioTextQueueItem['body']] as string);
  let storedMediaUrls: string[] = [];
  let outboundMediaUrls: string[] = [];
  const messageId = Date.now();

  // Add auth information to the media URLs
  if (mediaUrls.length > 0) {
    const twilioConf = await getTwilioSecret();
    storedMediaUrls = await Promise.all(mediaUrls
      // .map(url => url.replace(
      //   /https:\/\//,
      //   `https://${twilioConf.accountSid}:${twilioConf.authToken}@`
      // ))
      .map(async (url, idx) => {
        const key = `textMedia/${messageId}-${idx}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Basic ${Buffer
              .from(`${twilioConf.accountSid}:${twilioConf.authToken}`)
              .toString('base64')}`,
          },
        });
        await s3.send(new PutObjectCommand({
          Body: await response.bytes(),
          Bucket: cacheBucket,
          Key: key,
          ContentType: response.headers.get('content-type') || undefined,
        }));
        return key;
      }));
    outboundMediaUrls = await Promise.all(storedMediaUrls.map(async Key => {
      return await getSignedUrl(s3, new GetObjectCommand({
        Bucket: cacheBucket,
        Key,
      }), { expiresIn: 3600, });
    }));
  }

  // Save the message data
  const insertMessage = saveMessageData(
    isAnnouncement ? 'departmentAnnounce' : 'department',
    messageId,
    recipients.length,
    messageBody,
    storedMediaUrls,
    null,
    null,
    phoneNumberConfig.department,
    isTest
  );

  // Send the text to everyone
  await Promise.all(recipients
    .filter(number => typeof number.phone !== 'undefined')
    .map(async number => sendMessage(
      isAnnouncement ? 'departmentAnnounce' : 'department',
      messageId,
      number.phone,
      isAnnouncement
        ? await getPageNumber(number)
        : depConfig.textPhone || depConfig.pagePhone,
      messageBody,
      outboundMediaUrls
    )));
  await insertMessage;
}

async function handlePhoneIssue(body: PhoneNumberIssueQueueItem) {
  logger.trace('handlePhoneIssue', ...arguments);

  const recipients = (await getUserRecipients('all', null))
    .filter(u => {
      if (u.phone === body.number) {
        return false;
      }

      for (let i = 0; i < body.department.length; i++) {
        const dep = body.department[i];
        if (u[dep]?.admin && u[dep].active) {
          return true;
        }
      }

      return false;
    });
  const message = `Text delivery issue for ${body.name} (number ${formatPhone(body.number)})\n\nLast ${body.count} messages have not been delivered.`;

  const messageId = Date.now();
  const insertMessage = saveMessageData(
    'departmentAlert',
    messageId,
    recipients.length,
    message,
    [],
    null,
    null,
    body.department[0]
  );
  await Promise.all(recipients.map(async user => sendMessage(
    'departmentAlert',
    messageId,
    user.phone,
    await getPageNumber(user),
    message,
    []
  )));
  await insertMessage;
}

async function handleActivateUser(body: ActivateUserQueueItem) {
  logger.trace('handleActivateUser', ...arguments);
  const promises: Promise<unknown>[] = [];

  // Get the user's information
  const userGet = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: body.phone,
    },
  });
  if (!userGet.Item) {
    throw new Error(`Invalid user - ${body.phone}`);
  }
  const user = userGet.Item;

  const phoneCategories = await twilioPhoneCategories();
  const config = departmentConfig[body.department];
  const pagePhoneName: PhoneNumberTypes = config.pagePhone;
  if (
    typeof config === 'undefined' ||
    typeof phoneCategories[pagePhoneName] === 'undefined'
  ) {
    throw new Error(`Invalid phone config - ${config}`);
  }

  const pageTgs = (user.talkgroups || [])
    .map(key => pagingTalkgroupConfig[key].partyBeingPaged)
    .join(', ');
  const messagePieces: {
    [key in WelcomeMessageConfigKeys]: string;
  } = {
    pageNumber: formatPhone(phoneCategories[pagePhoneName].number.slice(2)),
    name: config.name,
    type: config.type,
  };
  const groupType = config.type === 'page'
    ? 'page'
    : pageTgs.length === 0
      ? 'text'
      : 'textPage';
  const phoneType = config.type === 'page'
    ? 'page'
    : 'text';
  const customWelcomeMessage = (
    `${welcomeMessageParts.welcome}\n\n` +
    `${welcomeMessageParts[`${groupType}Group`]}\n\n` +
    (pageTgs.length > 0 ? `You will receive pages for: ${pageTgs}\n\n` : '') +
    `${welcomeMessageParts.howToLeave}`
  )
    .replace(/\{\{([^\}]+)\}\}/g, (a: string, b: WelcomeMessageConfigKeys) => messagePieces[b]);
  promises.push(sendMessage(
    'account',
    null,
    body.phone,
    config[`${phoneType}Phone`] || config.pagePhone,
    customWelcomeMessage,
    []
  ));

  // Send a message to the admins
  promises.push(typedScan<FullUserObject>({
    TableName: TABLE_USER,
    ExpressionAttributeNames: {
      '#admin': 'admin',
      '#department': body.department,
      '#isDistrictAdmin': 'isDistrictAdmin',
    },
    ExpressionAttributeValues: {
      ':admin': true,
    },
    FilterExpression: '#department.#admin = :admin OR #isDistrictAdmin = :admin',
  })
    .then(admins => {
      const adminsToSendTo = admins.Items || [];
      if (adminsToSendTo.length === 0) {
        return;
      }

      const adminMessageId = Date.now();
      const adminMessageBody = `New subscriber: ${user.fName} ${user.lName} (${formatPhone(body.phone)}) has been added to the ${body.department} group`;
      return Promise.all([
        saveMessageData(
          'departmentAlert',
          adminMessageId,
          adminsToSendTo.length,
          adminMessageBody,
          [],
          null,
          null,
          body.department
        ),
        ...adminsToSendTo.map(async item => sendMessage(
          'departmentAlert',
          adminMessageId,
          item.phone,
          groupType === 'page'
            ? await getPageNumber(item)
            : config.textPhone || config.pagePhone,
          adminMessageBody
        )),
      ]);
    }));

  // Send a sample page
  if (user.talkgroups && user.talkgroups.length > 0) {
    promises.push(typedQuery<FullFileObject>({
      TableName: TABLE_FILE,
      IndexName: 'ToneIndex',
      ExpressionAttributeValues: {
        ':ToneIndex': 'y',
        ':Talkgroup': user.talkgroups[0],
      },
      ExpressionAttributeNames: {
        '#ToneIndex': 'ToneIndex',
        '#Talkgroup': 'Talkgroup',
      },
      KeyConditionExpression: '#ToneIndex = :ToneIndex',
      FilterExpression: '#Talkgroup = :Talkgroup',
      ScanIndexForward: false,
    })
      .then(data => {
        if (!data.Items || data.Items.length === 0) {
          return;
        }
        const pageKey = data.Items[0].Key?.split('/').pop() || 'none';
        const pageTg = data.Items[0].Talkgroup as PagingTalkgroup;

        return sendMessage(
          'account',
          null,
          body.phone,
          config.pagePhone,
          createPageMessage(pageKey, pageTg),
          []
        );
      }));
  }

  return await Promise.all(promises);
}

async function handleSiteStatus(body: SiteStatusQueueItem) {
  const sites = body.sites;

  await Promise.all(Object.keys(sites).map(async siteId => {
    const site = sites[siteId];
    const systemShortNames: string[] = [];

    const updateConfig: TypedUpdateInput<FullSiteObject> = {
      TableName: TABLE_SITE,
      Key: {
        SiteId: siteId,
      },
      ExpressionAttributeNames: {
        '#IsActive': 'IsActive',
      },
      ExpressionAttributeValues: {
        ':IsActive': 'y',
      },
      UpdateExpression: '',
    };
    const updateStrings: string[] = [ '#IsActive = :IsActive', ];
    (Object.keys(site) as (keyof typeof site)[]).forEach(key => {
      if (typeof site[key] === 'string') {
        return;
      }

      updateConfig.ExpressionAttributeNames[`#${key}`] = key as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      Object.keys(site[key]).forEach(shortName => {
        if (!systemShortNames.includes(shortName)) {
          updateConfig.ExpressionAttributeNames[`#sys${systemShortNames.length}`] = shortName;
          systemShortNames.push(shortName);
        }

        const sysIndex = systemShortNames.indexOf(shortName);
        const value = site[key][shortName];
        updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
        updateConfig.ExpressionAttributeValues[`:${key}${sysIndex}`] = value;
        updateStrings.push(`#${key}.#sys${sysIndex} = :${key}${sysIndex}`);
      });
    });
    updateConfig.UpdateExpression = `SET ${updateStrings.join(', ')}`;

    await typedUpdate<FullSiteObject>(updateConfig);
  }));
}

async function handleAuthCode(body: SendUserAuthCodeQueueItem) {
  logger.trace('handleAuthCode', ...arguments);
  const code = randomString(6, true);
  const codeTimeout = Date.now() + codeTtl;

  const updateResult = await typedUpdate<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: body.phone,
    },
    ExpressionAttributeNames: {
      '#code': 'code',
      '#codeExpiry': 'codeExpiry',
    },
    ExpressionAttributeValues: {
      ':code': code,
      ':codeExpiry': codeTimeout,
    },
    UpdateExpression: 'SET #code = :code, #codeExpiry = :codeExpiry',
    ReturnValues: 'ALL_NEW',
  });
  if (!updateResult.Attributes) {
    throw new Error('Failed to add login code to user');
  }

  await sendMessage(
    'account',
    null,
    body.phone,
    await getPageNumber(updateResult.Attributes as FullUserObject),
    `This message was only sent to you. Your login code is ${code}. This code expires in 5 minutes.`,
    []
  );
}

async function handlePage(body: SendPageQueueItem) {
  logger.trace('handlePage');

  // Build the message body
  const pageInitTime = new Date();
  const recipients = (await getUserRecipients('all', body.tg, !!body.isTest))
    .filter(v => !v.getTranscriptOnly);

  body.len = body.len || 0;

  // Increment the metrics looking at twilio health
  let metricPromise: Promise<unknown> = new Promise(res => res(null));
  const pageTime = fNameToDate(body.key);
  const lenMs = body.len * 1000;
  if (!body.isTest) {
    metricPromise = cloudWatch.send(new PutMetricDataCommand({
      Namespace: 'Twilio Health',
      MetricData: [
        {
          MetricName: 'PageDuration',
          Timestamp: pageTime,
          Unit: 'Milliseconds',
          Value: lenMs,
        },
        {
          MetricName: 'PageToQueue',
          Timestamp: pageTime,
          Unit: 'Milliseconds',
          Value: pageInitTime.getTime() - pageTime.getTime() - lenMs,
        },
      ],
    }));
  }

  // Get the on-call crew
  const [
    onCallCrew,
    onCallIds,
  ] = await getOnCallPeople(fNameToDate(body.key).getTime(), body.tg);

  // Save the message data
  const messageBody = createPageMessage(
    body.key,
    body.tg,
    null,
    null,
    null,
    onCallCrew,
    false
  );
  const messageId = Date.now();
  const insertMessagePromise = saveMessageData(
    'page',
    messageId,
    recipients.length,
    messageBody,
    [],
    body.key,
    body.tg,
    null,
    !!body.isTest
  );

  // Send the messages
  await Promise.all(recipients
    .map(async phone => sendMessage(
      'page',
      messageId,
      phone.phone,
      await getPageNumber(phone),
      createPageMessage(
        body.key,
        body.tg,
        phone.phone,
        messageId,
        null,
        phone.getOncallInfo ? onCallCrew : null,
        phone.getOncallInfo && typeof phone.aladTecId !== 'undefined'
          ? onCallIds.includes(phone.aladTecId)
          : false
      )
    )));
  await insertMessagePromise;
  await metricPromise;
}

async function parseRecord(event: lambda.SQSRecord) {
  logger.debug('parseRecord', ...arguments);
  const body = JSON.parse(event.body);
  if (typeof body.action === 'undefined' && typeof body['detail-type'] !== 'undefined') {
    body.action = 'transcribe';
  }
  let response;
  switch (body.action) {
    // v2 functions
    case 'transcribe':
      response = await handleTranscribe(body);
      break;
    case 'twilio-text':
      response = await handleTwilioText(body);
      break;
    case 'phone-issue':
      response = await handlePhoneIssue(body);
      break;
    case 'activate-user':
      response = await handleActivateUser(body);
      break;
    case 'site-status':
      response = await handleSiteStatus(body);
      break;
    case 'auth-code':
      response = await handleAuthCode(body);
      break;
    case 'page':
      response = await handlePage(body);
      break;
    default:
      throw new Error(`Unkown body - ${JSON.stringify(body)}`);
  }
  return response;
}

export async function main(event: lambda.SQSEvent) {
  logger.trace('main', ...arguments);
  await Promise.all(event.Records.map(parseRecord));
}
