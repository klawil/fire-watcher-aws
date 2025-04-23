import { BaseClientMock } from './_base';

export const S3Mock = new BaseClientMock();

export const S3Client = S3Mock.client;
export const DeleteObjectCommand = S3Mock.getCommand('delete');
export const HeadObjectCommand = S3Mock.getCommand('head');
export const GetObjectCommand = S3Mock.getCommand('get');
export const PutObjectCommand = S3Mock.getCommand('put');
