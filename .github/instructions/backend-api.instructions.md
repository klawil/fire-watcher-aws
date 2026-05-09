---
description: "Use when changing Lambda handlers, REST APIs, backend types, queue flows, DynamoDB access, or backend tests in fire-watcher-aws. Covers src/resources, src/types/api, src/stack, and tests/resources patterns."
name: "Backend API Workflow"
applyTo:
  - "src/resources/**/*.ts"
  - "src/types/api/**/*.ts"
  - "src/types/backend/**/*.ts"
  - "src/stack/**/*.ts"
  - "tests/resources/**/*.ts"
  - "tests/utils/backend/**/*.ts"
---
# Backend API Workflow

- For API changes, update the handler in `src/resources/api/v2`, the matching contract in `src/types/api`, and the nearest Vitest coverage in `tests/resources/api/v2` together.
- If the behavior depends on permissions, environment variables, or route exposure, verify the matching CDK wiring in `src/stack/lib/fire-watcher-aws-stack.ts`.
- Prefer the existing helpers in `src/resources/api/v2/_base.ts`, `src/resources/api/v2/_utils.ts`, `src/utils/backend/dynamoTyped.ts`, and `src/utils/backend/validation.ts` instead of introducing new request parsing or raw DynamoDB patterns.
- Keep API responses aligned with the existing typed pattern: validate inputs first, return typed status/body tuples, and let `handleResourceApi` build the gateway response.
- Preserve strict typing and existing DynamoDB key shapes; avoid widening types or bypassing the typed environment helpers in `src/types/backend/environment.ts`.
- Queue- and event-driven work usually spans more than one file. Check `src/resources/queue.ts`, `src/resources/s3.ts`, `src/resources/twilioQueueHandler.ts`, and `src/resources/eventFileQueueHandler.ts` before assuming a handler is isolated.
- When an API contract changes, regenerate `oas.json` with `npm run document` because the API docs page reads from that generated file.
- Agents must never run `npm run copy-constants`. If `src/utils/backend/hidden-constants.ts` is missing, stop and ask the user to handle constants setup before lint or tests.
- After each backend change, iterate until all of these commands pass: `npm run build`, `npm run test`, `npm run synth`, `npm run lint`, and `npm run document`.
