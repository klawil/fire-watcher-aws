import { FullFileObject } from '@/types/api/files';
import { fNameToDate } from '@/utils/common/strings';

export function dateToStr(d: Date) {
  const dateString = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString()
    .padStart(2, '0')}`;
  const timeString = [
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ]
    .map(n => n.toString().padStart(2, '0'))
    .join(':');

  return `${dateString} ${timeString}`;
}

export function dateTimeToTimeStr(datetime: number): string {
  return dateToStr(new Date(datetime));
}

export function dateTimeToPartition(datetime: number, roundUp = false): string {
  const date = new Date(datetime);
  date.setUTCMinutes(0, 0, 0);
  if (roundUp && date.getTime() < datetime) {
    date.setUTCHours(date.getUTCHours() + 1);
  }

  const month = (date.getUTCMonth() + 1).toString()
    .padStart(2, '0');
  const day = date.getUTCDate().toString()
    .padStart(2, '0');
  const hour = date.getUTCHours().toString()
    .padStart(2, '0');

  return `${date.getUTCFullYear()}-${month}-${day}-${hour}`;
}

export function datetimePartitionToTimestamp(datetime: string): number {
  const match = datetime.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid datetime partition: ${datetime}`);
  }

  const timestamp = new Date(`${match[1]}T${match[2]}:00:00Z`).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid datetime partition: ${datetime}`);
  }

  return timestamp;
}

export function secondsToTime(valueSeconds: number) {
  const maxValue = valueSeconds;
  let timeStr = '';
  if (maxValue >= 60 * 60) {
    const hours = Math.floor(valueSeconds / (60 * 60));
    timeStr += `${hours}:`;
    valueSeconds -= hours * 60 * 60;
  }
  const minutes = Math.floor(valueSeconds / 60);
  timeStr += `${minutes.toString().padStart(2, '0')}:`;
  valueSeconds -= minutes * 60;
  timeStr += `${valueSeconds.toString().padStart(2, '0')}`;

  return timeStr;
}

export function findClosestFileIdx(files: FullFileObject[], name: string) {
  const targetDate = Math.round(fNameToDate(name).getTime() / 1000);
  let closestVal: null | number = null;
  let closestIdx: number = 0;
  files.forEach((f, idx) => {
    const delta = Math.abs((f.StartTime || 0) - targetDate);
    if (closestVal === null || delta < closestVal) {
      closestVal = delta;
      closestIdx = idx;
    }
  });

  return closestIdx;
}
