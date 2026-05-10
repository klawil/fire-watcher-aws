---
name: api-change-checklist
description: 'Use when changing REST APIs, Lambda handlers, API contracts, backend tests, or OpenAPI docs in fire-watcher-aws. Guides the standard workflow across src/resources/api/v2, src/types/api, tests/resources/api/v2, CDK wiring, and npm run document.'
argument-hint: 'Describe the API, handler, or backend contract being changed'
---

# API Change Checklist

Use this skill for backend endpoint work in this repository.

## When To Use

- Adding a new endpoint under `src/resources/api/v2`
- Changing request or response shapes in `src/types/api`
- Updating Lambda behavior that depends on queue, S3, DynamoDB, Secrets Manager, or auth helpers
- Regenerating API documentation after contract changes
- Verifying backend changes against the repo's normal command flow

## Procedure

1. Identify the owning handler in `src/resources/api/v2` or the relevant Lambda entry in `src/resources`.
2. Find the matching API types in `src/types/api` and update contracts there first if the public shape changes.
3. Check `src/resources/api/v2/_base.ts` and `src/resources/api/v2/_utils.ts` for an existing validation, auth, or response-building pattern before adding new logic.
4. If the change affects permissions, route exposure, environment variables, or event sources, inspect `src/stack/lib/fire-watcher-aws-stack.ts`.
5. Update or add the nearest Vitest coverage, usually in `tests/resources/api/v2` or another matching `tests/resources` file.
6. Regenerate `oas.json` with `npm run document` whenever the API contract changed.
7. Agents must never run `npm run copy-constants`. If `src/utils/backend/hidden-constants.ts` is missing, stop and ask the user to handle constants setup before lint or tests.
8. Run verification commands based on what changed:
	- Run `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` if any code or configuration files changed.
	- Run `npm run synth` if CDK files or their dependencies changed.
	- Run `npm run document` if API files or their dependencies changed.

## Repository-Specific Reminders

- Prefer typed helpers over raw DynamoDB request construction when the repo already has a utility for the operation.
- Keep request validation and response assembly aligned with the existing tuple-returning API handler pattern.
- Do not assume a backend change is complete until both the handler and CDK wiring agree on permissions and environment.