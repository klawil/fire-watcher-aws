import { BaseClientMock } from './_base';

export const CloudWatchClientMock = new BaseClientMock();

export const CloudWatchClient = CloudWatchClientMock.client;
export const PutMetricDataCommand = CloudWatchClientMock.getCommand('putMetricData');
export const ListTagsForResourceCommand = CloudWatchClientMock.getCommand('listTagsForResource');
