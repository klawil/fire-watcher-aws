import { UpdateTextStatusApi } from '@/types/api/twilio';

export interface TwilioQueueEvent {
  datetime: number;
  status: UpdateTextStatusApi['body']['MessageStatus'];
  phone: number;
  eventTime: number;
}
