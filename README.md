# Fire Watcher AWS (COFRN)

[![Test Results Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fklawil.github.io%2Ffire-watcher-aws%2FtestResults.json)](https://klawil.github.io/fire-watcher-aws/)
[![Code Coverage Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fklawil.github.io%2Ffire-watcher-aws%2Fcoverage.json)](https://klawil.github.io/fire-watcher-aws/coverage/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**COFRN** is a text-based notification platform that alerts first responders of emergency requests via SMS. It continuously monitors radio channels for events and pages, automatically routing notifications to the appropriate personnel. The system also provides department management tools, radio traffic playback, and text messaging coordination.

**Live Site:** [COFRN.org](https://cofrn.org)

## Overview

COFRN serves as a modern backup to traditional paging and radio systems. When a dispatch event is detected on a monitored radio channel, the system automatically sends SMS notifications to registered first responders in that department. Beyond notifications, the platform provides:

- **Text Messaging Groups** - Coordinate with your department via text messaging
- **Radio Traffic Playback** - Review recorded radio communications
- **Event Tracking** - Monitor real-time DTR and page events
- **Department Management** - Administer users, talkgroups, and settings
- **Automated Workflows** - Queue-based processing of notifications, transcriptions, and invoicing

## Tech Stack

### Frontend
- **Framework:** [Next.js 15](https://nextjs.org/) with App Router
- **UI Library:** [React 19](https://react.dev/)
- **Styling:** [Bootstrap 5](https://getbootstrap.com/)
- **Charts:** [Chart.js](https://www.chartjs.org/) with React wrapper
- **Maps:** [Leaflet](https://leafletjs.com/) with React integration
- **Icons:** [React Icons](https://react-icons.github.io/react-icons/)
- **Date Picker:** [React DatePicker](https://reactdatepicker.com/)

### Backend & Infrastructure
- **Runtime:** [Node.js](https://nodejs.org/) on AWS Lambda
- **Infrastructure:** [AWS CDK](https://aws.amazon.com/cdk/) (TypeScript)
- **Language:** [TypeScript](https://www.typescriptlang.org/) with strict mode enabled
- **Database:** [DynamoDB](https://aws.amazon.com/dynamodb/)
- **Storage:** [Amazon S3](https://aws.amazon.com/s3/)
- **Messaging:** [Twilio SMS API](https://www.twilio.com/)
- **Email:** [AWS SES](https://aws.amazon.com/ses/)
- **Speech-to-Text:** [AWS Transcribe](https://aws.amazon.com/transcribe/)
- **Queues:** [Amazon SQS](https://aws.amazon.com/sqs/)
- **Scheduling:** [AWS EventBridge](https://aws.amazon.com/eventbridge/) & [AWS Scheduler](https://aws.amazon.com/scheduler/)
- **Monitoring:** [CloudWatch](https://aws.amazon.com/cloudwatch/)
- **CDN:** [CloudFront](https://aws.amazon.com/cloudfront/)

### Testing & Development
- **Testing Framework:** [Vitest](https://vitest.dev/)
- **Test Coverage:** [Vitest Coverage](https://vitest.dev/guide/coverage)
- **API Documentation:** [OpenAPI/Swagger](https://swagger.io/)
- **Linting:** [ESLint](https://eslint.org/)
- **Pre-commit Hooks:** [Husky](https://typicode.github.io/husky/)

## Project Structure

```
fire-watcher-aws/
├── src/
│   ├── app/                      # Next.js pages (App Router)
│   │   ├── page.tsx             # Home (Radio Traffic)
│   │   ├── events/              # DTR Events viewer
│   │   ├── users/               # User management
│   │   ├── departments/         # Department settings
│   │   ├── texts/               # Text message groups
│   │   ├── status/              # System status
│   │   ├── weather/             # Weather information
│   │   ├── profile/             # User profile
│   │   ├── pages/               # Paging events
│   │   ├── login/               # Authentication
│   │   ├── api-doc/             # API documentation
│   │   └── layout.tsx           # Root layout with auth
│   ├── components/              # Reusable React components
│   │   ├── layout.tsx           # Page wrapper & auth gating
│   │   ├── audioList/           # Radio traffic display
│   │   ├── audioPlayerBar/      # Audio player
│   │   ├── userEdit/            # User management UI
│   │   ├── departmentSettings/  # Department config UI
│   │   ├── invoiceList/         # Invoice display
│   │   └── ...                  # Other UI components
│   ├── resources/               # Lambda handler functions
│   │   ├── queue.ts             # SQS message processing
│   │   ├── s3.ts                # S3 event handling
│   │   ├── twilioQueueHandler.ts # Twilio status handling
│   │   ├── eventFileQueueHandler.ts # DTR event database handling
│   │   ├── generateInvoices.ts  # Invoice generation
│   │   ├── dailyEvents.ts       # Daily event aggregation
│   │   ├── emailHandler.ts      # Email forwarding
│   │   ├── status.ts            # System status checks
│   │   ├── weather.ts           # Weather data updates
│   │   ├── importAladTec.ts     # Scheduling data import
│   │   └── api/v2/              # REST API endpoints
│   │       ├── users.ts
│   │       ├── departments.ts
│   │       ├── talkgroups.ts
│   │       ├── events.ts
│   │       ├── texts.ts
│   │       ├── invoices.ts
│   │       └── ...              # Additional endpoints
│   ├── stack/                   # AWS CDK infrastructure
│   │   ├── bin/                 # CDK entry point
│   │   └── lib/
│   │       └── fire-watcher-aws-stack.ts  # Main stack definition
│   ├── types/                   # TypeScript type definitions
│   │   ├── api/                 # API request/response types
│   │   ├── backend/             # Backend types (DynamoDB, env)
│   │   └── frontend/            # Frontend-only types
│   └── utils/
│       ├── backend/             # Server utilities
│       │   ├── dynamoTyped.ts   # DynamoDB helpers
│       │   ├── texts.ts         # SMS sending
│       │   └── shiftData.ts     # Shift tracking
│       ├── frontend/            # Client utilities
│       │   └── typeFetch.ts     # Typed API calls
│       └── common/              # Shared utilities
├── tests/                       # Vitest test files
│   ├── resources/               # Backend tests
│   ├── utils/                   # Utility tests
│   ├── setupEnv.ts              # Test environment
│   └── setupMocks.ts            # AWS/Twilio mocks
├── __mocks__/                   # Mock implementations
│   ├── twilio.ts
│   └── @aws-sdk/                # AWS SDK mocks
├── public/                      # Static assets
└── package.json, tsconfig.json, cdk.json, etc.
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- AWS Account with credentials configured
- Environment variables setup (see `.env.example`)

### Installation

```bash
# Install dependencies
npm install

# Set up backend constants (required for testing)
npm run copy-constants
```

### Development

```bash
# Start local frontend dev server (http://localhost:3000)
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm run test

# Generate/update OpenAPI spec from Lambda handlers
npm run document
```

### Building

```bash
# Build production static export
npm run build

# Synthesize CDK infrastructure
npm run synth

# Review infrastructure changes
npm run diff
```

### Deployment

```bash
# Backend deployment (test, build, synth, deploy backend)
npm run deploy

# Full deployment (test, build, synth, deploy backend and frontend)
npm run deploy-frontend
```

## Core Features

### DTR & Page Detection
The system monitors radio channels for Digital Trunk Radio (DTR) and VHF events and emergency pages. When a matching event is detected for a registered talkgroup:
1. Event is queued for processing
2. Currently on-shift members are determined
3. User recipients are determined based on user preferences
4. SMS notifications are sent via Twilio
5. Event details are logged in DynamoDB

### Text Messaging Groups
First responders can coordinate via SMS text messaging. Each department can maintain text groups that:
- Accept incoming messages from members
- Broadcast messages to all group participants
- Log all communications for review

This feature is optional and some departments do not use it.

### Radio Traffic Playback
Recorded radio communications are archived and available for playback:
- Filter by date range, talkgroup, or specific event types
- Automatic transcription via AWS Transcribe for paging messages and specific event types

### Department Management
Administrators can configure:
- User accounts and permissions
- Radio talkgroup names
- Notification routing rules
- Invoice tracking

### Event Tracking
Dashboards showing:
- Historic DTR events
- Message delivery status
- System health and metrics
- Weather conditions by location

## API Documentation

The REST API is documented via OpenAPI/Swagger. Access the API docs at `/api-doc` on the live site or view `oas.json`.

**Key Endpoints:**
- `GET /api/v2/users/{id}` - Get user information
- `POST /api/v2/texts/` - Send text message
- `GET /api/v2/events/` - Query events
- `GET /api/v2/files/` - List audio files
- `POST /api/v2/invoices/` - Generate invoices
- And many more...

For full endpoint details, regenerate docs with `npm run document`.

## Testing

Tests are run with Vitest and include AWS SDK and Twilio mocks:

```bash
# Run all tests (including coverage output)
npm run test

# Run specific test file
npm run test -- tests/resources/queue.test.ts
```

Test setup files:
- `tests/setupEnv.ts` - Environment configuration
- `tests/setupMocks.ts` - Mock implementations
- `__mocks__/` - Mock modules for AWS SDK and Twilio

## Development Guidelines

### Code Organization
- **Frontend Code:** React components in `src/app/` and `src/components/`
- **Backend Code:** Lambda handlers in `src/resources/`
- **Infrastructure:** CDK constructs in `src/stack/`
- **Shared Types:** API and backend types in `src/types/`
- **Utilities:** Typed helpers in `src/utils/` (backend, frontend, common)

### Type Safety
- TypeScript strict mode is enforced
- All AWS SDK and DynamoDB interactions should use typed helpers in `src/utils/backend/dynamoTyped.ts`
- Avoid widening types to `any`

### Import Path Alias
- `@/*` maps to `src/*` - use this instead of relative imports

### Queue-Driven Backend
Key queue handlers for event processing:
- `src/resources/queue.ts` - Main SQS message processor
- `src/resources/twilioQueueHandler.ts` - Twilio status message processor
- `src/resources/eventFileQueueHandler.ts` - Updates Athena database with new partitions
- `src/resources/s3.ts` - Radio recording upload handler
- `src/resources/generateInvoices.ts` - Invoice creation

### API Workflow
When adding/modifying REST endpoints:
1. Define types in `src/types/api/`
2. Implement handler in `src/resources/api/v2/`
3. Wire routes & permissions in `src/stack/lib/fire-watcher-aws-stack.ts`
4. Run `npm run document` to regenerate OpenAPI spec
5. Update tests in `tests/resources/api/v2/`

## Monitoring & Logs

- CloudWatch logs are available in AWS Console
- API request logs are automatically recorded
- Error metrics are published to CloudWatch
- System health checks for VHF recording run on schedule

## Environment Variables

Key environment variables (configured during deployment):
- `BUCKET_NAME` - S3 bucket for audio files
- `TWILIO_SECRET_ARN` - Secrets Manager secret for Twilio credentials
- `JWT_SECRET` - JWT signing key for authentication
- `EMAIL_DOMAIN` - Domain for SES email sending
- Shared API secrets and other items created outside of CDK

See `.env.example` or CDK stack for complete configuration.

## Common Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript validation |
| `npm run lint` | Code linting |
| `npm run test` | Run all tests |
| `npm run document` | Generate OpenAPI spec |
| `npm run synth` | CDK synthesis |
| `npm run diff` | Review infrastructure changes |
| `npm run deploy` | Backend deployment |
| `npm run deploy-frontend` | Full deployment |

## Related Resources

- **Live Site:** [COFRN.org](https://cofrn.org)
- **Test Coverage:** [GitHub Pages](https://klawil.github.io/fire-watcher-aws/coverage/)
- **OpenAPI Docs:** `/api-doc` endpoint
- **AWS CDK Docs:** [aws-cdk-lib](https://docs.aws.amazon.com/cdk/)
- **Next.js Docs:** [nextjs.org](https://nextjs.org/)

## Notes for Developers

- The repository uses a monorepo structure with frontend, backend, and infrastructure code in one TypeScript workspace
- Some backend code depends on deprecated utilities in `src/deprecated/` - be careful when refactoring
- Tests use AWS SDK and Twilio mocks from `__mocks__/` directory
- Before finishing code changes, ensure this command sequence passes:
  1. `npm run type-check`
  2. `npm run lint`
  3. `npm run test`
  4. `npm run synth`
  5. `npm run document`
  6. `npm run build`
