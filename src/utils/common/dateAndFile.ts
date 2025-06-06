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
