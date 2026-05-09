---
description: "Use when changing Next.js pages, React components, layout/auth gating, or frontend data-fetching in fire-watcher-aws. Covers src/app, src/components, and frontend utilities."
name: "Frontend App Workflow"
applyTo:
  - "src/app/**/*.ts"
  - "src/app/**/*.tsx"
  - "src/components/**/*.ts"
  - "src/components/**/*.tsx"
  - "src/utils/frontend/**/*.ts"
  - "src/utils/frontend/**/*.tsx"
---
# Frontend App Workflow

- Pages live under `src/app`; start from the route page and then inspect the nearest shared component in `src/components` before making structural changes.
- Reuse the existing auth and page-shell patterns from `src/components/layout.tsx` and the user-loading flow in `src/app/layout.tsx` instead of inventing a parallel gating model.
- Frontend API calls should stay aligned with the typed fetch flow in `src/utils/frontend/typeFetch.ts` and the contracts in `src/types/api`.
- This app is built as a static export in production. If a change depends on server-only runtime behavior, verify it still fits the `next.config.ts` export model and the local rewrite behavior.
- Keep UI changes consistent with the existing React Bootstrap usage unless the surrounding feature already uses a different local pattern.
- When changing a screen that depends on API data, verify the backend contract still matches the frontend assumptions instead of patching around mismatches in the UI.
- After each frontend change, iterate until all of these commands pass: `npm run build`, `npm run test`, `npm run synth`, `npm run lint`, and `npm run document`.
