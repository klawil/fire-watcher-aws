import {
  PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import {
  GetSecretValueCommand, SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';

import {
  SHIFT_S3_BUCKET, SHIFT_S3_KEY,
  getShiftData
} from '@/utils/backend/shiftData';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/importAladTec.ts');

const s3 = new S3Client();

const secretManager = new SecretsManagerClient();

const credentialSecret = process.env.ALADTEC_SECRET as string;

export async function getAuthCookie(): Promise<string> {
  logger.trace('getAuthCookie', ...arguments);
  const secretValueRaw = await secretManager.send(new GetSecretValueCommand({
    SecretId: credentialSecret,
  }));
  const secretValue: {
    username: string;
    password: string;
  } = JSON.parse(secretValueRaw.SecretString as string);

  const loginRequest = await fetch('https://secure5.aladtec.com/saguache/index.php?action=login', {
    redirect: 'manual',
    credentials: 'include',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Cookie': 'display_mobile_version_ems9646=0; __asc=a014a800181d41e881c3b5778dd; __auc=a014a800181d41e881c3b5778dd; _ga=GA1.2.797233503.1657121180; _gid=GA1.2.398202284.1657121180; _gat_gtag_UA_759812_5=1',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    referrer: 'https://secure5.aladtec.com/saguache/index.php',
    body: `username=${encodeURIComponent(secretValue.username)}&password=${encodeURIComponent(secretValue.password)}`,
    'method': 'POST',
    'mode': 'cors',
  });
  const cookieValues = loginRequest.headers.getSetCookie()
    .filter(v => v.includes('ems9646s'))
    .map(v => v.split(';')[0].split('=')[1].trim());

  return cookieValues[cookieValues.length - 1];
}

function dateToAladtecString(d: Date): string {
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}` +
    `-${d.getDate().toString()
      .padStart(2, '0')}+00%3A00%3A00`;
}

export async function main() {
  const oldShiftDataPromise = getShiftData();

  const cookieValue = await getAuthCookie();

  const startDate = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const endDate = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000));
  const startDateString = dateToAladtecString(startDate);
  const endDateString = dateToAladtecString(endDate);

  // Set the filter
  await fetch('https://secure5.aladtec.com/saguache/index.php?action=manage_reports_view_scheduled_hours', {
    redirect: 'manual',
    credentials: 'include',
    'headers': {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
      Cookie: `__asc=a014a800181d41e881c3b5778dd; __auc=a014a800181d41e881c3b5778dd; display_mobile_version_ems9646=0; _ga=GA1.2.754559253.1692484179; _gid=GA1.2.398202284.1657121180; _gat_gtag_UA_759812_5=1; ems9646s=${cookieValue}`,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'https://secure5.aladtec.com',
      Referer: 'https://secure5.aladtec.com/saguache/index.php?action=manage_display_homepage&lid=186',
    },
    'body': `view_options_action=update&report_type=custom&mode=ajax&new_date=${startDateString}&new_end_date=${endDateString}&report_type=custom&share_filter=0&format=1&format_submitted=1&time_filters_submitted=1&all_schedules=1&schedules%5B%5D=1&schedules%5B%5D=6&schedules%5B%5D=4&schedules%5B%5D=2&schedules%5B%5D=5&schedules%5B%5D=3&schedules%5B%5D=7&schedules%5B%5D=9&schedules%5B%5D=10&schedules_submitted=1&all_positions=1&positions%5B%5D=1&positions%5B%5D=5&positions%5B%5D=2&positions%5B%5D=6&positions%5B%5D=3&positions%5B%5D=4&positions_submitted=1&all_timetypes=1&timetypes%5B%5D=0&timetypes%5B%5D=1&timetypes%5B%5D=2&timetypes%5B%5D=3&timetypes%5B%5D=dis&timetypes_submitted=1&member_attribute_include=7&member_attributes%5B%5D=1&member_attributes%5B%5D=3&member_attributes_submitted=1&mfatt_1=USR%3Ausr_is_active&mfop_1=0&mfusr_1=1`,
    'method': 'POST',
  }).then(r => r.json()); // Forces the response to be JSON so we know it worked

  // Get the data
  const dataResponse = await fetch(`https://secure5.aladtec.com/saguache/index.php?action=manage_reports_view_scheduled_hours&new_date=${startDateString}&new_end_date=${endDateString}`, {
    redirect: 'manual',
    'credentials': 'include',
    'headers': {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
      Cookie: `__asc=a014a800181d41e881c3b5778dd; __auc=a014a800181d41e881c3b5778dd; display_mobile_version_ems9646=0; _ga=GA1.2.754559253.1692484179; _gid=GA1.2.398202284.1657121180; _gat_gtag_UA_759812_5=1; ems9646s=${cookieValue}`,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'https://secure5.aladtec.com',
      Referer: 'https://secure5.aladtec.com/saguache/index.php?action=manage_display_homepage&lid=186',
    },
    'body': `mode=ajax&_search=false&nd=${Date.now()}&rows=1000&page=1&sidx=member&sord=asc`,
    'method': 'POST',
  });
  const dataRaw: {
    rows: {
      id: number;
      cell: string[];
    }[];
  } = await dataResponse.json();

  process.env.TZ = 'America/Denver';

  const shiftData = await oldShiftDataPromise;
  shiftData.shifts = [];
  dataRaw.rows.forEach(row => {
    const [
      cell,
      fName,
      lName,
      startDateStr,
      startTimeStr,
      endDateStr,
      endTimeStr,
      department,
    ] = row.cell;

    const startDate = new Date(`${startDateStr} ${startTimeStr}`);
    const endDate = new Date(`${endDateStr} ${endTimeStr}`);
    const id = cell.match(/member=([0-9]+)\&/);
    const name = `${fName} ${lName}`;

    if (id === null) {
      return;
    }

    // Save the name
    if (shiftData.people[id[1]] !== name) {
      shiftData.people[id[1]] = name;
    }

    // Save the shift
    shiftData.shifts.push({
      id: id[1],
      start: startDate.getTime(),
      end: endDate.getTime(),
      department,
    });
  });
  logger.log('Saving', shiftData);

  // Write the data
  await s3.send(new PutObjectCommand({
    Bucket: SHIFT_S3_BUCKET,
    Key: SHIFT_S3_KEY,
    Body: JSON.stringify(shiftData),
  }));
}
