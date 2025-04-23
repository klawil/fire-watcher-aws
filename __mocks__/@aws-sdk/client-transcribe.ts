import { BaseClientMock } from './_base';

export const TranscribeClientMock = new BaseClientMock();

export const TranscribeClient = TranscribeClientMock.client;
export const StartTranscriptionJobCommand = TranscribeClientMock.getCommand('startTranscriptionJob');
export const GetTranscriptionJobCommand = TranscribeClientMock.getCommand('getTranscriptionJob');
