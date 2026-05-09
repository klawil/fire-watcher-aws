# AGENTS.md

## Scope

- Applies to the whole repository.
- Start with [README.md](README.md) for the high-level project description and deployment entrypoint.

## Stack

- Frontend: Next.js App Router in `src/app`, static export build via `next.config.ts`.
- UI components: `src/components`.
- Backend runtime code: Lambda handlers in `src/resources` and REST API handlers in `src/resources/api/v2`.
- Infrastructure: AWS CDK in `src/stack`.
- Shared contracts: API and backend types in `src/types`.
- Tests: Vitest in `tests`, with AWS/Twilio mocks in `__mocks__`.

## Safe Default Commands

- Install deps: `npm install`
- Local frontend dev server: `npm run dev`
- Lint: `npm run lint`
- Tests: `npm run test`
- Build production static export: `npm run build`
- Regenerate OpenAPI spec: `npm run document`
- Synthesize CDK: `npm run synth`
- Diff CDK changes: `npm run diff`

## Required Setup Before Lint/Test

- Agents must never run `npm run copy-constants`. If `src/utils/backend/hidden-constants.ts` is missing, stop and ask the user to handle constants setup.
- Tests rely on `tests/setupEnv.ts` and `tests/setupMocks.ts`; do not replace those with ad hoc environment bootstrapping.

## Code Map

- Add or change REST endpoints in `src/resources/api/v2`; keep the request and response contracts aligned with the matching definitions in `src/types/api`.
- When an API shape changes, regenerate `oas.json` with `npm run document`. The API docs page reads directly from that file.
- CDK route wiring and Lambda permissions are defined in `src/stack/lib/fire-watcher-aws-stack.ts`; check there before assuming an endpoint or environment variable is exposed.
- Queue-driven and event-driven backend flows are centered in `src/resources/queue.ts`, `src/resources/s3.ts`, `src/resources/twilioQueueHandler.ts`, `src/resources/eventFileQueueHandler.ts`, and `src/resources/generateInvoices.ts`.
- Frontend pages live under `src/app/*/page.tsx`; shared layout/auth gating patterns live in `src/components/layout.tsx` and related components.

## Conventions That Matter

- TypeScript is strict. Preserve existing types instead of widening to `any`.
- Path alias `@/*` maps to `src/*`.
- ESLint enforces import ordering, no unresolved imports, and a fairly strict stylistic config. Keep edits small and consistent with nearby formatting.
- Prefer existing typed helpers in `src/utils/backend/dynamoTyped.ts`, validation helpers, and shared API utilities over raw AWS SDK calls when working inside existing patterns.
- Existing tests usually mirror the source area they cover. Add or update the nearest Vitest file instead of creating disconnected test locations.

## Repo-Specific Pitfalls

- `npm run build` sets `PROD_BUILD=y`, which switches Next output to `output/build`. Non-production local behavior uses rewrites in `next.config.ts` instead.
- The GitHub workflow runs `npm run copy-constants`, `npm run lint`, and `npm run test`; agents must not run `npm run copy-constants` locally and should keep code changes compatible with that CI order.
- Some backend logic still depends on code under `src/deprecated`. Do not remove those imports unless you have traced all callers.
- This repo mixes frontend code, Lambda handlers, and CDK definitions in one TypeScript workspace. When changing behavior, check both the handler and the infrastructure wiring before concluding the implementation is complete.

## Change Workflow For Agents

- For UI work, inspect the matching page in `src/app` and the nearest reusable component in `src/components` before editing.
- For backend/API work, inspect the handler, the matching type definition in `src/types/api`, and the CDK wiring if permissions or environment variables are involved.
- After each code change, iterate until all of these commands pass: `npm run build`, `npm run test`, `npm run synth`, `npm run lint`, and `npm run document`.