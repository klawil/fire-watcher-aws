import {
  readdirSync, writeFileSync
} from 'fs';
import { resolve } from 'path';

import TypescriptOAS, {
  OpenApiSpecData,
  createProgram
} from 'ts-oas';

const outputFileName = resolve('oas.json');
const basePath = resolve('src', 'types', 'api');

const baseOasSpec: OpenApiSpecData<'3.1.0'> = {
  components: {
    securitySchemes: {
      cookie: {
        type: 'apiKey',
        in: 'cookie',
        description: 'JWT passed as a cookie',
        name: 'cofrn-token',
      },
      apiKey: {
        type: 'apiKey',
        in: 'query',
        description: 'API key passed in as a query string parameter',
        name: 'cofrn-api-key',
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'APIs for Authentication',
    },
    {
      name: 'Departments',
      description: 'APIs about departments',
    },
    {
      name: 'Errors',
      description: 'APIs that submit front end errors',
    },
    {
      name: 'Events',
      description: 'APIs that work with DTR events',
    },
    {
      name: 'Files',
      description: 'Read only access to information about the audio files',
    },
    {
      name: 'Heartbeats',
      description: 'Pings from the VHF recording servers',
    },
    {
      name: 'Metrics',
      description: 'Metrics about the system',
    },
    {
      name: 'Radios',
      description: 'Information about radios the DTR system has events for',
    },
    {
      name: 'Sites',
      description: 'Information about sites the DTR system monitors',
    },
    {
      name: 'Talkgroups',
      description: 'Information about talkgroups recognized by the system',
    },
    {
      name: 'Texts',
      description: 'Information about texts sent using the system',
    },
    {
      name: 'Twilio',
      description: 'APIs used as Twilio webhooks',
    },
    {
      name: 'Users',
      description: 'Access or modify User resources',
    },
    {
      name: 'Users/Department',
      description: 'Modify User assocations with Departments',
    },
  ],
};

// Find all of the definition files
const files = readdirSync(basePath);

// Build the functions to get typing
const tsProgram = createProgram(
  files,
  {
    strictNullChecks: true,
  },
  basePath
);
const tsoas = new TypescriptOAS(
  tsProgram,
  {
    ignoreErrors: true,
    defaultNumberType: 'integer',
  }
);

// Build the OAS
const specObject = tsoas.getOpenApiSpec(
  [ /.Api$/, ],
  baseOasSpec
);

// Mark certain APIs as deprecated
Object.keys(specObject.paths).forEach(path => {
  if (path.includes('/v2/')) {
    return;
  }

  Object.keys(specObject.paths[path]).forEach(method => {
    (specObject.paths[path] as any)[method].deprecated = true; // eslint-disable-line
  });
});
writeFileSync(outputFileName, JSON.stringify(specObject, null, 2));
