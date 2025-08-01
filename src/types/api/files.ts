import {
  api400Body, api404Body, api500Body
} from './_shared';

import { Validator } from '@/types/backend/validation';

export interface FullFileObject {
  Talkgroup: number;

  DeviceProcessed?: boolean; // Temp field, delete
  RadioID?: string; // Only actually on device files but added to make typing easier

  /**
   * Timestamp of when the file was added to S3
   */
  Added: number;
  Emergency?: 0 | 1;

  /**
   * Timestamp of the end of the recording (in seconds since epoch)
   */
  EndTime?: number;
  Freq?: number;

  /**
   * Location of the file in the S3 bucket
   */
  Key?: string;
  Len?: number;
  Sources?: number[];

  /**
   * Timestamp of the start of the recording (in seconds since epoch)
   */
  StartTime?: number;
  Tone?: boolean;
  ToneIndex?: 'y' | 'n';
  Tower?: string;
  Transcript?: string;
  PageSent?: boolean;
}

export interface FileTranslationObject {
  Key: string;
  NewKey?: string;
  TTL?: number;
}

/**
 * Retrieve a list of files that match the given filters
 * @summary Retrieve Files List
 * @tags Files
 */
export type GetAllFilesApi = {
  path: '/api/v2/files/';
  method: 'GET';
  query: {

    /**
     * The talkgroups to retrieve file from. This should be a pipe-separated list of integers
     */
    tg?: number[];

    /**
     * The radio ID to retrieve files from. This should be a single integer
     */
    radioId?: string;

    /**
     * Whether to exclusively return traffic that is marked as "emergency"
     */
    emerg?: 'y' | 'n';

    /**
     * Whether to exclusively return traffic that includes a paging tone
     */
    tone?: 'y' | 'n';

    /**
     * Return files with a start time less than this time
     */
    before?: number;

    /**
     * Return files with a start time greater than this time
     */
    after?: number;

    /**
     * Return files with an added time greater than this time
     */
    afterAdded?: number;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: {
      before: number | null;
      after: number | null;
      afterAdded: number | null;
      files: FullFileObject[];
    };

    /**
     * @contentType application/json
     */
    400: typeof api400Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
};

export const getAllFilesApiQueryValidator: Validator<GetAllFilesApi['query']> = {
  tg: {
    required: false,
    types: {
      array: {},
    },
  },
  radioId: {
    required: false,
    types: {
      string: {
        regex: /^[0-9]+$/,
      },
    },
  },
  emerg: {
    required: false,
    types: {
      string: {
        exact: [
          'y',
          'n',
        ],
      },
    },
  },
  tone: {
    required: false,
    types: {
      string: {
        exact: [
          'y',
          'n',
        ],
      },
    },
  },
  before: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
  after: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
  afterAdded: {
    required: false,
    parse: v => Number(v),
    types: {
      number: {},
    },
  },
};

/**
 * Retrieve metadata for a specific file
 * @summary Retrieve File Information
 * @tags Files
 */
export type GetFileApi = {
  path: '/api/v2/files/{id}/';
  method: 'GET';
  params: {

    /**
     * File ID in the format {Talkgroup}-{Added}
     */
    id: string;
  };
  responses: {

    /**
     * @contentType application/json
     */
    200: FullFileObject;

    /**
     * @contentType application/json
     */
    400: typeof api400Body;

    /**
     * @contentType application/json
     */
    404: typeof api404Body;

    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
};

export const getFileApiParamsValidator: Validator<GetFileApi['params']> = {
  id: {
    required: true,
    types: {
      string: {
        regex: /^[0-9]+-[0-9]+$/,
      },
    },
  },
};
