import { BaseClientMock } from './_base';

export const SQSClientMock = new BaseClientMock();

export const SQSClient = SQSClientMock.client;
export const SendMessageCommand = SQSClientMock.getCommand('sendMessage');
