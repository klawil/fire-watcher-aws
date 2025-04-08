import TypescriptOAS, { createProgram, OpenApiSpecData } from "ts-oas";
import { resolve } from "path";
import { readdirSync, writeFileSync } from 'fs';

const outputFileName = resolve('oas.json');
const basePath = resolve('src', 'types', 'api');

const baseOasSpec: OpenApiSpecData<"3.1.0"> = {
  components: {
    securitySchemes: {
      cookie: {
        type: 'apiKey',
        in: 'cookie',
        description: 'JWT passed as a cookie',
        name: 'cofrn-token',
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'APIs for Authentication',
    },
    {
      name: 'Files',
      description: 'Read only access to information about the audio files',
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
  ]
};

// Find all of the definition files
const files = readdirSync(basePath)

// Build the functions to get typing
const tsProgram = createProgram(
  files,
  {
    strictNullChecks: true,
  },
  basePath,
);
const tsoas = new TypescriptOAS(
  tsProgram,
  {
    ignoreErrors: true,
    defaultNumberType: 'integer',
  },
);

// Build the OAS
const specObject = tsoas.getOpenApiSpec(
  [ /.Api$/ ],
  baseOasSpec,
);
writeFileSync(outputFileName, JSON.stringify(specObject, null, 2));