import { Validator } from "../backend/validation";
import { api400Body, api500Body } from "./_shared";

/**
 * Create a text (this endpoint is used by Twilio)
 * @summary Create a Text
 * @tags Twilio
 * @body.contentType application/x-www-form-urlencoded
 */
export type CreateTextApi = {
  path: '/api/v2/twilio/';
  method: 'POST';
  query: {
    /**
     * The API code to authenticate the request in the test environment
     */
    code?: string;
  };
  body: {
    /**
     * The phone number the message was received from, format +1XXXXXXXXXX
     */
    From: string;
    /**
     * The phone number the message was sent to, format +1XXXXXXXXXX
     */
    To: string;
    /**
     * The body of the text
     */
    Body: string;
    /**
     * The number of media files associated with the message
     */
    NumMedia: number;
    /**
     * The number of segments associated with the message
     */
    NumSegments: number;
    /**
     * URL to any media attached to the message
     */
    MediaUrl0?: string;
    /**
     * URL to any media attached to the message
     */
    MediaUrl1?: string;
    /**
     * URL to any media attached to the message
     */
    MediaUrl2?: string;
    /**
     * URL to any media attached to the message
     */
    MediaUrl3?: string;
    /**
     * URL to any media attached to the message
     */
    MediaUrl4?: string;
    /**
     * URL to any media attached to the message
     */
    MediaUrl5?: string;
  };
  responses: {
    /**
     * @contentType application/xml
     */
    200: string;
    /**
     * @contentType application/xml
     */
    400: string;
    /**
     * @contentType application/json
     */
    500: typeof api500Body;
  };
}

export const createTextQueryValidator: Validator<CreateTextApi['query']> = {
  code: {
    required: false,
    types: { string: {} },
  },
};

export const createTextBodyValidator: Validator<CreateTextApi['body']> = {
  From: {
    required: true,
    types: {
      string: {
        regex: /^\+1[0-9]{10}$/,
      },
    },
  },
  To: {
    required: true,
    types: {
      string: {
        regex: /^\+1[0-9]{10}$/,
      },
    },
  },
  Body: {
    required: true,
    types: { string: {} },
  },
  NumMedia: {
    required: true,
    parse: v => Number(v),
    types: { number: {} },
  },
  NumSegments: {
    required: true,
    parse: v => Number(v),
    types: { number: {} },
  },
  MediaUrl0: {
    required: false,
    types: { string: {} },
  },
  MediaUrl1: {
    required: false,
    types: { string: {} },
  },
  MediaUrl2: {
    required: false,
    types: { string: {} },
  },
  MediaUrl3: {
    required: false,
    types: { string: {} },
  },
  MediaUrl4: {
    required: false,
    types: { string: {} },
  },
  MediaUrl5: {
    required: false,
    types: { string: {} },
  },
};

/**
 * Update a text's status (this endpoint is used by Twilio)
 * @summary Update a Text
 * @tags Twilio
 * @body.contentType application/x-www-form-urlencoded
 */
export type UpdateTextStatusApi = {
  path: '/api/v2/twilio/{id}/';
  method: 'POST';
  params: {
    /**
     * The message ID (timestamp that the message was sent)
     */
    id: number;
  };
  query: {
    /**
     * The API code to authenticate the request
     */
    code?: string;
  };
  body: {
    MessageStatus: 'delivered' | 'undelivered' | 'sent';
    /**
     * The phone number the message was sent to in the format +1XXXXXXXXXX
     */
    To: string;
    /**
     * The phone number the message was sent from in the format +1XXXXXXXXXX
     */
    From: string;
  };
  responses: {
    204: '';
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

export const updateTextStatusParamsValidator: Validator<UpdateTextStatusApi['params']> = {
  id: {
    required: true,
    parse: v => Number(v),
    types: {
      number: {
        regex: /^[0-9]{13}/, // Makes sure the time is at least in the right realm
      },
    },
  },
};

export const updateTextStatusBodyValidator: Validator<UpdateTextStatusApi['body']> = {
  To: createTextBodyValidator.To,
  From: createTextBodyValidator.From,
  MessageStatus: {
    required: true,
    types: {
      string: {
        exact: [ 'delivered', 'undelivered', 'sent', ],
      },
    },
  },
};
